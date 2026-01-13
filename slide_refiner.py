"""
PDF Slide Refiner with Gemini Nano Banana Pro
将 PDF 形式的 PPT 进行高清化修正，使用 Gemini Nano Banana Pro 对每页进行增强处理
"""

import os
import sys
import time
import tempfile
from pathlib import Path
from PIL import Image
from pdf2image import convert_from_path
from google import genai
from google.genai import types
import img2pdf


def get_pdf_page_count(pdf_path: str) -> int:
    """获取 PDF 页数"""
    from pdf2image.pdf2image import pdfinfo_from_path
    info = pdfinfo_from_path(pdf_path)
    return info['Pages']


def pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 300) -> list[str]:
    """
    将 PDF 转换为高质量图片
    
    Args:
        pdf_path: PDF 文件路径
        output_dir: 输出目录
        dpi: 分辨率，默认 300
        
    Returns:
        生成的图片路径列表
    """
    print(f"📄 正在将 PDF 转换为图片 (DPI: {dpi})...")
    
    images = convert_from_path(pdf_path, dpi=dpi)
    image_paths = []
    
    total = len(images)
    for i, image in enumerate(images):
        image_path = os.path.join(output_dir, f"page_{i+1:03d}.png")
        image.save(image_path, "PNG")
        image_paths.append(image_path)
        print(f"  [{i+1}/{total}] 已转换第 {i+1} 页")
    
    print(f"✅ PDF 转换完成，共 {len(image_paths)} 页\n")
    return image_paths


def detect_aspect_ratio(image: Image.Image) -> str:
    """
    根据图片尺寸检测最接近的宽高比
    
    Args:
        image: PIL Image 对象
        
    Returns:
        宽高比字符串，如 "16:9"
    """
    width, height = image.size
    ratio = width / height
    
    # 支持的宽高比
    aspect_ratios = {
        "1:1": 1.0,
        "2:3": 2/3,
        "3:2": 3/2,
        "3:4": 3/4,
        "4:3": 4/3,
        "4:5": 4/5,
        "5:4": 5/4,
        "9:16": 9/16,
        "16:9": 16/9,
        "21:9": 21/9,
    }
    
    # 找到最接近的宽高比
    closest_ratio = min(aspect_ratios.items(), key=lambda x: abs(x[1] - ratio))
    return closest_ratio[0]


def blank_watermark_area(image: Image.Image, corner_width_ratio: float = 0.15, corner_height_ratio: float = 0.08) -> Image.Image:
    """
    移除右下角水印区域（用背景色填充）
    
    Args:
        image: PIL Image 对象
        corner_width_ratio: 右下角区域宽度占图片宽度的比例
        corner_height_ratio: 右下角区域高度占图片高度的比例
        
    Returns:
        处理后的 PIL Image 对象
    """
    width, height = image.size
    
    # 计算右下角区域
    corner_width = int(width * corner_width_ratio)
    corner_height = int(height * corner_height_ratio)
    
    # 获取右下角区域的左上角坐标
    x1 = width - corner_width
    y1 = height - corner_height
    x2 = width
    y2 = height
    
    # 采样背景色（从右下角区域上方取样）
    # 取水印区域上方一点的颜色作为背景色
    sample_y = max(0, y1 - 10)
    sample_x = x1 + corner_width // 2
    try:
        bg_color = image.getpixel((sample_x, sample_y))
    except:
        bg_color = (245, 245, 245)  # 默认浅灰色背景
    
    # 创建副本并填充
    result = image.copy()
    from PIL import ImageDraw
    draw = ImageDraw.Draw(result)
    draw.rectangle([x1, y1, x2, y2], fill=bg_color)
    
    return result


def enhance_image_with_gemini(
    client: genai.Client,
    image_path: str, 
    output_path: str,
    page_num: int,
    total_pages: int,
    resolution: str = "4K",
    max_retries: int = 3,
    remove_watermark_flag: bool = False
) -> bool:
    """
    使用 Gemini Nano Banana Pro 增强单张图片
    
    Args:
        client: Gemini API 客户端
        image_path: 输入图片路径
        output_path: 输出图片路径
        page_num: 当前页码
        total_pages: 总页数
        resolution: 分辨率 (1K, 2K, 4K)
        max_retries: 最大重试次数
        
    Returns:
        是否成功
    """
    print(f"  [{page_num}/{total_pages}] 正在增强第 {page_num} 页 ({resolution})...")
    
    # 根据是否需要移除水印选择不同的 prompt
    if remove_watermark_flag:
        prompt = """Enhance this presentation slide to ultra-high definition quality.

CRITICAL RULES:
1. PRESERVE all content exactly - do not change, add, or remove any text, graphics, charts, or layout
2. SHARPEN all text to be crisp and highly readable with clean edges
3. ENHANCE image quality - reduce blur, noise, and compression artifacts
4. IMPROVE color vibrancy while maintaining the original color scheme
5. OUTPUT at maximum resolution
6. IMPORTANT: There is a BLANK/SOLID COLOR AREA in the bottom-right corner. Fill this blank area seamlessly by extending the surrounding background pattern or color naturally. Make it look like the blank area was never there.

This is an image quality enhancement and inpainting task."""
    else:
        prompt = """Enhance this presentation slide to ultra-high definition quality.

CRITICAL RULES:
1. PRESERVE all content exactly - do not change, add, or remove any text, graphics, charts, or layout
2. SHARPEN all text to be crisp and highly readable with clean edges
3. ENHANCE image quality - reduce blur, noise, and compression artifacts
4. IMPROVE color vibrancy while maintaining the original color scheme
5. OUTPUT at maximum resolution

This is ONLY an image quality enhancement task - keep all original content exactly as shown."""

    image = Image.open(image_path)
    
    # 如果需要移除水印，先处理图片
    if remove_watermark_flag:
        image = blank_watermark_area(image)
        print(f"      🔧 已移除右下角水印区域")
    
    aspect_ratio = detect_aspect_ratio(image)
    
    for attempt in range(max_retries):
        try:
            # 根据文档，使用 response_modalities=['TEXT', 'IMAGE']
            response = client.models.generate_content(
                model="gemini-3-pro-image-preview",
                contents=[prompt, image],
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE'],
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect_ratio,
                        image_size=resolution
                    ),
                )
            )
            
            # 检查响应是否有效
            if response is None or response.parts is None:
                print(f"      ⚠️ 第 {page_num} 页返回空响应 (尝试 {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    time.sleep(5)
                    continue
                return False
            
            # 保存增强后的图片 - 只保存最后一张图片（最终结果）
            saved = False
            for part in response.parts:
                # 跳过思考过程中的图片
                if hasattr(part, 'thought') and part.thought:
                    continue
                if part.inline_data is not None:
                    enhanced_image = part.as_image()
                    enhanced_image.save(output_path)
                    saved = True
            
            if saved:
                print(f"      ✅ 第 {page_num} 页增强完成 (宽高比: {aspect_ratio}, {resolution})")
                return True
            else:
                print(f"      ⚠️ 第 {page_num} 页未返回图片 (尝试 {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    time.sleep(2)  # 等待后重试
                    continue
                return False
            
        except Exception as e:
            error_msg = str(e)
            print(f"      ⚠️ 第 {page_num} 页错误 (尝试 {attempt + 1}/{max_retries}): {error_msg[:80]}...")
            
            if attempt < max_retries - 1:
                wait_time = 5 * (attempt + 1)  # 指数退避: 5s, 10s, 15s
                print(f"      ⏳ 等待 {wait_time} 秒后重试...")
                time.sleep(wait_time)
            else:
                print(f"      ❌ 第 {page_num} 页增强失败，已重试 {max_retries} 次")
                return False
    
    return False


def images_to_pdf(image_paths: list[str], output_pdf: str):
    """
    将图片列表合并为 PDF
    
    Args:
        image_paths: 图片路径列表
        output_pdf: 输出 PDF 路径
    """
    print(f"📦 正在将 {len(image_paths)} 张图片合并为 PDF...")
    
    # 使用 img2pdf 合并
    with open(output_pdf, "wb") as f:
        f.write(img2pdf.convert(image_paths))
    
    print(f"✅ PDF 合并完成: {output_pdf}\n")


def refine_pdf(input_pdf: str, output_pdf: str, api_key: str = None, resolution: str = "4K", remove_watermark: bool = False):
    """
    主函数：对 PDF 进行高清化修正
    
    Args:
        input_pdf: 输入 PDF 路径
        output_pdf: 输出 PDF 路径
        api_key: Gemini API Key（可选，默认从环境变量读取）
        resolution: 输出分辨率 (1K, 2K, 4K)
        remove_watermark: 是否移除右下角水印
    """
    # 检查输入文件
    if not os.path.exists(input_pdf):
        print(f"❌ 错误: 输入文件不存在: {input_pdf}")
        sys.exit(1)
    
    # 获取 API Key
    if api_key:
        os.environ['GOOGLE_API_KEY'] = api_key
    
    if not os.environ.get('GOOGLE_API_KEY'):
        print("❌ 错误: 请设置 GOOGLE_API_KEY 环境变量")
        sys.exit(1)
    
    # 初始化 Gemini 客户端
    # 修复 Python 3.14 + OpenSSL 3.6.0 兼容性问题：
    # httpx 默认使用 HTTP/2，但与该版本组合存在 SSL 问题
    # 解决方案：创建自定义 httpx 客户端，禁用 HTTP/2
    import httpx
    custom_httpx_client = httpx.Client(
        http2=False,           # 禁用 HTTP/2，使用 HTTP/1.1
        trust_env=False,       # 不使用系统代理环境变量
        timeout=600            # 600 秒超时用于 4K 图片生成
    )
    http_options = types.HttpOptions(httpxClient=custom_httpx_client)
    client = genai.Client(http_options=http_options)
    
    # 获取 PDF 页数
    page_count = get_pdf_page_count(input_pdf)
    print(f"\n{'='*60}")
    print(f"📊 PDF Slide Refiner with Gemini Nano Banana Pro")
    print(f"{'='*60}")
    print(f"📁 输入文件: {input_pdf}")
    print(f"📄 总页数: {page_count} 页")
    print(f"✅ 输出分辨率: {resolution}")
    if remove_watermark:
        print(f"🛠️  移除水印: 是")
    print(f"⏱️  预计时间: {page_count * 30}-{page_count * 60} 秒")
    print(f"{'='*60}\n")
    
    # 创建临时目录
    with tempfile.TemporaryDirectory() as temp_dir:
        original_dir = os.path.join(temp_dir, "original")
        enhanced_dir = os.path.join(temp_dir, "enhanced")
        os.makedirs(original_dir)
        os.makedirs(enhanced_dir)
        
        # Step 1: PDF 转图片
        print("📋 Step 1/3: PDF 转换为图片")
        print("-" * 40)
        original_images = pdf_to_images(input_pdf, original_dir, dpi=300)
        
        # Step 2: 使用 Gemini 增强每张图片
        print("🎨 Step 2/3: 使用 Gemini Nano Banana Pro 增强图片")
        print("-" * 40)
        enhanced_images = []
        success_count = 0
        fail_count = 0
        
        start_time = time.time()
        
        for i, original_path in enumerate(original_images):
            page_num = i + 1
            enhanced_path = os.path.join(enhanced_dir, f"enhanced_{page_num:03d}.png")
            
            page_start = time.time()
            success = enhance_image_with_gemini(
                client=client,
                image_path=original_path,
                output_path=enhanced_path,
                page_num=page_num,
                total_pages=len(original_images),
                resolution=resolution,
                max_retries=3,
                remove_watermark_flag=remove_watermark
            )
            page_time = time.time() - page_start
            
            if success:
                enhanced_images.append(enhanced_path)
                success_count += 1
            else:
                # 如果增强失败，使用原图
                enhanced_images.append(original_path)
                fail_count += 1
            
            # 显示进度
            elapsed = time.time() - start_time
            avg_time = elapsed / page_num
            remaining = avg_time * (len(original_images) - page_num)
            print(f"      ⏱️  本页耗时: {page_time:.1f}s | 剩余预计: {remaining/60:.1f} 分钟\n")
        
        total_time = time.time() - start_time
        print(f"📊 增强结果: {success_count} 成功, {fail_count} 失败 | 总耗时: {total_time/60:.1f} 分钟\n")
        
        # Step 3: 合并为 PDF
        print("📑 Step 3/3: 合并为 PDF")
        print("-" * 40)
        images_to_pdf(enhanced_images, output_pdf)
    
    # 完成
    output_size = os.path.getsize(output_pdf) / (1024 * 1024)
    print(f"{'='*60}")
    print(f"🎉 处理完成!")
    print(f"📁 输出文件: {output_pdf}")
    print(f"📊 文件大小: {output_size:.2f} MB")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python slide_refiner.py <input.pdf> <output.pdf> [resolution] [--remove-watermark] [api_key]")
        print("示例: python slide_refiner.py slides/input.pdf output_refined.pdf 4K")
        print("示例: python slide_refiner.py slides/input.pdf output_refined.pdf 4K --remove-watermark")
        print("分辨率选项: 1K, 2K, 4K (默认 4K)")
        print("--remove-watermark: 移除右下角 NotebookLM 水印")
        sys.exit(1)
    
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    
    # 解析参数
    resolution = "4K"
    remove_watermark = False
    api_key = None
    
    for arg in sys.argv[3:]:
        if arg == "--remove-watermark":
            remove_watermark = True
        elif arg in ["1K", "2K", "4K"]:
            resolution = arg
        elif not arg.startswith("--"):
            api_key = arg
    
    refine_pdf(input_pdf, output_pdf, api_key, resolution, remove_watermark)
