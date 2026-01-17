/**
 * Slide Editor - Frontend Application
 * 幻灯片编辑器前端逻辑 - v4.0
 */

class SlideEditor {
    constructor() {
        this.sessionId = null;
        this.pages = [];
        this.currentPage = 0;
        this.hasTemplate = false;

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        // Views
        this.viewUpload = document.getElementById('view-upload');
        this.viewWorkspace = document.getElementById('view-workspace');

        // Upload
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.uploadLoading = document.getElementById('upload-loading');

        // Main Workspace
        this.thumbnailsList = document.getElementById('thumbnails-list');
        this.previewImg = document.getElementById('preview-img');
        this.loadingVeil = document.getElementById('loading-veil');

        // Controls
        this.inputPrompt = document.getElementById('input-prompt');
        this.infoPageNum = document.getElementById('info-page-num');
        this.infoStatus = document.getElementById('info-status');
        this.pageCounter = document.getElementById('page-counter');
        this.statDone = document.getElementById('stat-done');
        this.statTotal = document.getElementById('stat-total');

        // Buttons
        this.btnEnhance = document.getElementById('btn-enhance');
        this.btnReset = document.getElementById('btn-reset');
        this.btnEnhanceAll = document.getElementById('btn-enhance-all');
        this.btnPrev = document.getElementById('btn-prev');
        this.btnNext = document.getElementById('btn-next');
        this.btnExportPdf = document.getElementById('btn-export-pdf');
        this.btnExportPptx = document.getElementById('btn-export-pptx');
        this.btnNewProject = document.getElementById('btn-new-project');

        // Template elements
        this.templateZone = document.getElementById('template-zone');
        this.templateInput = document.getElementById('template-input');
        this.templatePlaceholder = document.getElementById('template-placeholder');
        this.templatePreview = document.getElementById('template-preview');
        this.btnApplyTemplate = document.getElementById('btn-apply-template');
        this.btnClearTemplate = document.getElementById('btn-clear-template');
        this.btnApplyTemplateAll = document.getElementById('btn-apply-template-all');

        // Extend elements
        this.extendCount = document.getElementById('extend-count');
        this.extendTopic = document.getElementById('extend-topic');
        this.btnExtend = document.getElementById('btn-extend');
    }

    initEventListeners() {
        // Upload
        this.dropZone.addEventListener('click', (e) => {
            if (e.target.closest('.checkbox-wrapper')) return;
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('drag-over');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('drag-over');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.pdf')) {
                this.uploadFile(file);
            }
        });

        // Navigation
        this.btnPrev.addEventListener('click', () => this.navigatePage(-1));
        this.btnNext.addEventListener('click', () => this.navigatePage(1));

        document.addEventListener('keydown', (e) => {
            if (this.viewWorkspace.classList.contains('hidden')) return;
            if (e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft') this.navigatePage(-1);
            if (e.key === 'ArrowRight') this.navigatePage(1);
        });

        // Actions
        this.btnEnhance.addEventListener('click', () => this.enhanceCurrentPage());
        this.btnReset.addEventListener('click', () => this.resetCurrentPage());
        this.btnEnhanceAll.addEventListener('click', () => this.enhanceAllPages());

        // Export
        this.btnExportPdf.addEventListener('click', () => this.exportAs('pdf'));
        this.btnExportPptx.addEventListener('click', () => this.exportAs('pptx'));
        this.btnNewProject.addEventListener('click', () => this.newProject());

        // Template
        this.templateZone.addEventListener('click', () => this.templateInput.click());
        this.templateInput.addEventListener('change', (e) => this.handleTemplateSelect(e));
        this.btnApplyTemplate.addEventListener('click', () => this.applyTemplateToPage());
        this.btnClearTemplate.addEventListener('click', () => this.clearTemplate());
        this.btnApplyTemplateAll.addEventListener('click', () => this.applyTemplateToAll());

        // Extend
        this.btnExtend.addEventListener('click', () => this.extendSlides());
    }

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) await this.uploadFile(file);
    }

    async uploadFile(file) {
        // 文件大小检查 (限制 100MB)
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            alert(`错误: 文件太大 (${(file.size / 1024 / 1024).toFixed(1)}MB)。请上传小于 100MB 的 PDF 文件。`);
            return;
        }

        // 文件名清理：处理中文和特殊字符
        let safeFile = file;
        const originalName = file.name;

        // 如果文件名包含非 ASCII 字符，创建一个新的 File 对象
        if (/[^\x00-\x7F]/.test(originalName)) {
            // 保留原始扩展名，使用时间戳作为安全文件名
            const safeName = `upload_${Date.now()}.pdf`;
            safeFile = new File([file], safeName, { type: file.type });
            console.log(`文件名已转换: ${originalName} -> ${safeName}`);
        }

        this.uploadLoading.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', safeFile);

        // 添加原始文件名作为额外字段
        formData.append('original_filename', originalName);

        try {
            // 使用 AbortController 设置超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分钟超时

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorMsg = '上传失败';
                try {
                    const errData = await response.json();
                    errorMsg = errData.detail || errorMsg;
                } catch (e) {
                    errorMsg = `服务器错误 (${response.status})`;
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            this.sessionId = data.session_id;
            this.pages = data.pages;

            this.showWorkspace();
            this.renderThumbnails();
            this.selectPage(0);
            this.updateStats();

        } catch (error) {
            if (error.name === 'AbortError') {
                alert('错误: 上传超时，请检查网络连接后重试。');
            } else {
                alert('错误: ' + error.message);
            }
        } finally {
            this.uploadLoading.classList.add('hidden');
        }
    }

    showWorkspace() {
        this.viewUpload.classList.add('hidden');
        this.viewWorkspace.classList.remove('hidden');
    }

    showUpload() {
        this.viewWorkspace.classList.add('hidden');
        this.viewUpload.classList.remove('hidden');
    }

    renderThumbnails() {
        this.thumbnailsList.innerHTML = '';
        this.pages.forEach((page, index) => {
            const el = document.createElement('div');
            el.className = 'thumbnail-item';
            el.onclick = () => this.selectPage(index);

            const img = document.createElement('img');
            img.src = page.original;
            img.className = 'thumbnail-img';
            img.loading = 'lazy';

            const badge = document.createElement('div');
            badge.className = 'page-badge';
            badge.textContent = page.id;

            el.appendChild(img);
            el.appendChild(badge);

            if (page.status === 'done') {
                const status = document.createElement('span');
                status.className = 'status-indicator';
                status.textContent = '✅';
                el.appendChild(status);
            }

            this.thumbnailsList.appendChild(el);
        });
    }

    selectPage(index) {
        if (index < 0 || index >= this.pages.length) return;
        this.currentPage = index;
        const page = this.pages[index];

        // Highlight thumbnail
        const thumbs = this.thumbnailsList.children;
        for (let i = 0; i < thumbs.length; i++) {
            thumbs[i].classList.toggle('selected', i === index);
        }

        // Update image
        const imgSrc = page.enhanced || page.original;
        this.previewImg.src = `${imgSrc}?t=${Date.now()}`;

        // Update info
        this.infoPageNum.textContent = page.id;
        this.pageCounter.textContent = `${index + 1} / ${this.pages.length}`;

        if (page.status === 'done') {
            this.infoStatus.textContent = '已处理';
            this.infoStatus.className = 'status-tag completed';
        } else {
            this.infoStatus.textContent = '未处理';
            this.infoStatus.className = 'status-tag';
        }

        // Nav buttons
        this.btnPrev.disabled = index === 0;
        this.btnNext.disabled = index === this.pages.length - 1;

        // Clear prompt
        this.inputPrompt.value = '';

        // Scroll to top of main content
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    navigatePage(delta) {
        this.selectPage(this.currentPage + delta);
    }

    async enhanceCurrentPage() {
        const page = this.pages[this.currentPage];
        this.showVeil(true);

        const formData = new FormData();
        const prompt = this.inputPrompt.value.trim();
        if (prompt) formData.append('custom_prompt', prompt);

        if (!this.sessionId) return;

        try {
            const res = await fetch(`/api/sessions/${this.sessionId}/enhance/${page.id}`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error((await res.json()).detail || 'Failed');

            const data = await res.json();
            page.enhanced = data.enhanced;
            page.status = 'done';

            this.selectPage(this.currentPage);
            this.refreshThumbnail(this.currentPage);
            this.updateStats();

        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            this.showVeil(false);
        }
    }

    async resetCurrentPage() {
        const page = this.pages[this.currentPage];
        if (page.status !== 'done') return;

        if (this.sessionId) {
            await fetch(`/api/sessions/${this.sessionId}/reset/${page.id}`, { method: 'POST' });
        }

        page.enhanced = null;
        page.status = 'pending';

        this.refreshThumbnail(this.currentPage, true);
        this.selectPage(this.currentPage);
        this.updateStats();
    }

    updateStats() {
        const doneCount = this.pages.filter(p => p.status === 'done').length;
        this.statDone.textContent = doneCount;
        this.statTotal.textContent = this.pages.length;
    }

    refreshThumbnail(index, reset = false) {
        const thumb = this.thumbnailsList.children[index];
        if (!thumb) return;

        const page = this.pages[index];
        const img = thumb.querySelector('img');

        if (page.enhanced && !reset) {
            img.src = `${page.enhanced}?t=${Date.now()}`;
        } else {
            img.src = page.original;
        }

        let statusIcon = thumb.querySelector('.status-indicator');
        if (page.status === 'done') {
            if (!statusIcon) {
                statusIcon = document.createElement('span');
                statusIcon.className = 'status-indicator';
                statusIcon.textContent = '✅';
                thumb.appendChild(statusIcon);
            }
        } else {
            if (statusIcon) statusIcon.remove();
        }
    }

    showVeil(visible) {
        if (visible) this.loadingVeil.classList.remove('hidden');
        else this.loadingVeil.classList.add('hidden');
    }

    async enhanceAllPages() {
        const pending = this.pages.filter(p => p.status !== 'done');
        if (pending.length === 0) {
            alert('所有页面已处理完毕');
            return;
        }

        if (!confirm(`准备处理 ${pending.length} 个页面，确定继续吗？`)) return;

        this.showVeil(true);
        this.btnEnhanceAll.disabled = true;

        for (let i = 0; i < this.pages.length; i++) {
            if (this.pages[i].status === 'done') continue;

            this.selectPage(i);

            try {
                const formData = new FormData();
                // Include watermark removal option from checkbox
                const chkWatermark = document.getElementById('remove-watermark');
                if (chkWatermark && chkWatermark.checked) {
                    formData.append('remove_watermark', 'true');
                }
                const res = await fetch(`/api/sessions/${this.sessionId}/enhance/${this.pages[i].id}`, {
                    method: 'POST', body: formData
                });
                if (res.ok) {
                    const d = await res.json();
                    this.pages[i].enhanced = d.enhanced;
                    this.pages[i].status = 'done';
                    this.refreshThumbnail(i);
                    this.updateStats();
                }
            } catch (e) {
                console.error(e);
            }
        }

        this.showVeil(false);
        this.btnEnhanceAll.disabled = false;
        this.selectPage(0);
        alert('批量处理完成');
    }

    async exportAs(format) {
        if (!this.sessionId) return;
        this.showVeil(true);
        try {
            const res = await fetch(`/api/sessions/${this.sessionId}/export/${format}`, { method: 'POST' });
            if (!res.ok) throw new Error('Export failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            let filename = `export.${format}`;
            const disposition = res.headers.get('Content-Disposition');
            if (disposition && disposition.includes('filename=')) {
                filename = disposition.split('filename=')[1].split(';')[0].replace(/['"]/g, '');
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert(e.message);
        } finally {
            this.showVeil(false);
        }
    }

    async newProject() {
        if (confirm('确定要关闭当前项目吗？')) {
            if (this.sessionId) {
                fetch(`/api/sessions/${this.sessionId}`, { method: 'DELETE' }).catch(() => { });
            }
            window.location.reload();
        }
    }

    // ========== Template Methods ==========

    async handleTemplateSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        this.showVeil(true);
        try {
            const res = await fetch(`/api/sessions/${this.sessionId}/template`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '上传失败');
            }

            // Show template preview
            this.templatePlaceholder.classList.add('hidden');
            this.templatePreview.classList.remove('hidden');
            this.templatePreview.src = `/api/sessions/${this.sessionId}/template?t=${Date.now()}`;
            this.hasTemplate = true;

            // Enable buttons
            this.btnApplyTemplate.disabled = false;
            this.btnClearTemplate.disabled = false;
            this.btnApplyTemplateAll.disabled = false;

        } catch (err) {
            alert('错误: ' + err.message);
        } finally {
            this.showVeil(false);
        }
    }

    async clearTemplate() {
        if (!this.sessionId) return;

        await fetch(`/api/sessions/${this.sessionId}/template`, { method: 'DELETE' });

        this.templatePreview.classList.add('hidden');
        this.templatePlaceholder.classList.remove('hidden');
        this.templatePreview.src = '';
        this.hasTemplate = false;

        this.btnApplyTemplate.disabled = true;
        this.btnClearTemplate.disabled = true;
        this.btnApplyTemplateAll.disabled = true;
        this.templateInput.value = '';
    }

    async applyTemplateToPage() {
        if (!this.hasTemplate || !this.sessionId) return;

        const page = this.pages[this.currentPage];
        this.showVeil(true);

        try {
            const res = await fetch(`/api/sessions/${this.sessionId}/apply-template/${page.id}`, {
                method: 'POST'
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '应用失败');
            }

            const data = await res.json();
            page.enhanced = data.enhanced;
            page.status = 'done';

            this.selectPage(this.currentPage);
            this.refreshThumbnail(this.currentPage);
            this.updateStats();

        } catch (err) {
            alert('错误: ' + err.message);
        } finally {
            this.showVeil(false);
        }
    }

    async applyTemplateToAll() {
        if (!this.hasTemplate || !this.sessionId) return;

        const pending = this.pages.filter(p => p.status !== 'done');
        if (pending.length === 0) {
            if (!confirm('所有页面已处理，是否重新应用模板到全部页面？')) return;
        } else {
            if (!confirm(`准备应用模板到 ${this.pages.length} 个页面，确定继续吗？`)) return;
        }

        this.showVeil(true);
        this.btnApplyTemplateAll.disabled = true;

        for (let i = 0; i < this.pages.length; i++) {
            this.selectPage(i);

            try {
                const res = await fetch(`/api/sessions/${this.sessionId}/apply-template/${this.pages[i].id}`, {
                    method: 'POST'
                });

                if (res.ok) {
                    const d = await res.json();
                    this.pages[i].enhanced = d.enhanced;
                    this.pages[i].status = 'done';
                    this.refreshThumbnail(i);
                    this.updateStats();
                }
            } catch (e) {
                console.error(`Page ${i + 1} failed:`, e);
            }
        }

        this.showVeil(false);
        this.btnApplyTemplateAll.disabled = false;
        this.selectPage(0);
        alert('模板应用完成！');
    }

    // ========== Extend Methods ==========

    async extendSlides() {
        if (!this.sessionId) return;

        const count = parseInt(this.extendCount.value) || 1;
        const topic = this.extendTopic.value.trim();

        if (count < 1 || count > 10) {
            alert('新增页数需在 1-10 之间');
            return;
        }

        if (!confirm(`将生成 ${count} 个新页面${topic ? '，主题：' + topic : ''}，确定继续吗？`)) {
            return;
        }

        this.showVeil(true);
        this.btnExtend.disabled = true;

        const formData = new FormData();
        formData.append('count', count);
        if (topic) {
            formData.append('topic', topic);
        }

        try {
            const res = await fetch(`/api/sessions/${this.sessionId}/extend`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '生成失败');
            }

            const data = await res.json();

            // 将新页面添加到本地 pages 数组
            for (const page of data.pages) {
                this.pages.push(page);
            }

            // 重新渲染缩略图列表
            this.renderThumbnails();
            this.updateStats();

            // 跳转到第一个新生成的页面
            const firstNewIndex = this.pages.length - data.generated_count;
            this.selectPage(firstNewIndex);

            alert(`成功生成 ${data.generated_count} 个新页面！`);

        } catch (err) {
            alert('错误: ' + err.message);
        } finally {
            this.showVeil(false);
            this.btnExtend.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new SlideEditor();
});
