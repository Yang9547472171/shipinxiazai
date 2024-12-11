document.addEventListener('DOMContentLoaded', function() {
    const videoUrlsInput = document.getElementById('videoUrls');
    const downloadBtn = document.getElementById('downloadBtn');
    const clearBtn = document.getElementById('clearBtn');
    const downloadList = document.getElementById('downloadList');

    let activeDownloads = new Map();

    downloadBtn.addEventListener('click', async function() {
        const urls = videoUrlsInput.value.trim().split('\n').filter(url => url.trim());
        
        if (urls.length === 0) {
            alert('请输入视频链接');
            return;
        }

        downloadBtn.disabled = true;
        
        for (const url of urls) {
            await startDownload(url.trim());
        }
    });

    clearBtn.addEventListener('click', function() {
        videoUrlsInput.value = '';
    });

    async function startDownload(url) {
        try {
            const downloadItem = createDownloadItem(url);
            downloadList.insertBefore(downloadItem, downloadList.firstChild);

            const response = await fetch('/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url })
            });

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }

            activeDownloads.set(data.video_id, downloadItem);
            startProgressTracking(data.video_id, downloadItem);

        } catch (error) {
            updateDownloadItemStatus(downloadItem, 'error', error.message);
            downloadBtn.disabled = false;
        }
    }

    function createDownloadItem(url) {
        const platform = url.toLowerCase().includes('bilibili.com') ? 'bilibili' : 'youtube';
        const platformIcon = platform === 'bilibili' ? '📺' : '▶️';
        
        const item = document.createElement('div');
        item.className = 'download-item';
        item.innerHTML = `
            <div class="item-header">
                <div class="title">
                    <span class="platform-icon" title="${platform}">${platformIcon}</span>
                    ${url}
                </div>
                <button class="close-button" title="关闭">×</button>
            </div>
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress" style="width: 0%"></div>
                </div>
            </div>
            <div class="status">准备下载...</div>
        `;

        // 添加关闭按钮事件
        const closeButton = item.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            item.classList.add('removing');
            setTimeout(() => item.remove(), 300);
        });

        return item;
    }

    function startProgressTracking(videoId, downloadItem) {
        const progressBar = downloadItem.querySelector('.progress');
        const statusText = downloadItem.querySelector('.status');
        
        const checkProgress = async () => {
            try {
                const response = await fetch(`/progress/${videoId}`);
                const data = await response.json();

                progressBar.style.width = `${data.progress}%`;
                statusText.textContent = `下载进度: ${Math.round(data.progress)}%`;

                if (data.status === 'completed') {
                    updateDownloadItemStatus(downloadItem, 'completed', '下载完成！');
                    activeDownloads.delete(videoId);
                    if (activeDownloads.size === 0) {
                        downloadBtn.disabled = false;
                        setTimeout(() => {
                            location.reload();
                        }, 1500);
                    }
                    return;
                } else if (data.status === 'error') {
                    throw new Error(data.error || '下载失败');
                }

                setTimeout(checkProgress, 1000);
            } catch (error) {
                updateDownloadItemStatus(downloadItem, 'error', error.message);
                activeDownloads.delete(videoId);
                if (activeDownloads.size === 0) {
                    downloadBtn.disabled = false;
                }
            }
        };

        checkProgress();
    }

    function updateDownloadItemStatus(item, status, message) {
        item.className = `download-item ${status}`;
        const statusText = item.querySelector('.status');
        statusText.textContent = message;

        // 如果是错误状态，显示关闭按钮的提示
        if (status === 'error') {
            const closeButton = item.querySelector('.close-button');
            if (closeButton) {
                closeButton.title = '点击关闭';
                closeButton.style.display = 'block';  // 确保错误时关闭按钮可见
            }
        }

        if (status === 'completed') {
            if (videoList && videoList.classList.contains('collapsed')) {
                videoList.classList.remove('collapsed');
                toggleBtn.classList.remove('collapsed');
            }
        }
    }

    const toggleBtn = document.getElementById('toggleVideos');
    const videoList = document.getElementById('videoList');
    
    if (toggleBtn && videoList) {
        toggleBtn.addEventListener('click', function() {
            videoList.classList.toggle('collapsed');
            toggleBtn.classList.toggle('collapsed');
            
            localStorage.setItem('videoListCollapsed', videoList.classList.contains('collapsed'));
        });

        const wasCollapsed = localStorage.getItem('videoListCollapsed') === 'true';
        if (wasCollapsed) {
            videoList.classList.add('collapsed');
            toggleBtn.classList.add('collapsed');
        }
    }

    // 删除单个视频
    document.querySelectorAll('.delete-video').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const videoItem = this.closest('.video-item');
            const videoPath = videoItem.dataset.videoPath;
            
            if (!confirm('确定要删除这个视频吗？')) {
                return;
            }

            try {
                const response = await fetch(`/video/${videoPath}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    videoItem.classList.add('removing');
                    setTimeout(() => {
                        videoItem.remove();
                        updateVideoCount();
                    }, 300);
                } else {
                    throw new Error('删除失败');
                }
            } catch (error) {
                alert('删除视频失败: ' + error.message);
            }
        });
    });

    // 清空所有视频
    const clearAllBtn = document.getElementById('clearAll');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async function() {
            if (!confirm('确定要清空所有视频吗？此操作不可恢复！')) {
                return;
            }

            try {
                const response = await fetch('/videos/clear', {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const videoList = document.querySelector('.video-section');
                    videoList.classList.add('removing');
                    setTimeout(() => {
                        videoList.remove();
                    }, 300);
                } else {
                    throw new Error('清空失败');
                }
            } catch (error) {
                alert('清空视频失败: ' + error.message);
            }
        });
    }

    // 更新视频数量
    function updateVideoCount() {
        const videoCount = document.querySelectorAll('.video-item').length;
        const title = document.querySelector('.section-header h2');
        if (title) {
            title.textContent = `已下载视频 (${videoCount})`;
            
            // 如果没有视频了，移除整个视频区域
            if (videoCount === 0) {
                const videoSection = document.querySelector('.video-section');
                videoSection.classList.add('removing');
                setTimeout(() => {
                    videoSection.remove();
                }, 300);
            }
        }
    }
}); 