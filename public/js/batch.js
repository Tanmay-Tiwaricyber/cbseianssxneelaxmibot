// Function to format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return {
        date: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        relative: getRelativeTime(date)
    };
}

// Function to get relative time
function getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

// Function to get file icon
function getFileIcon(file) {
    if (file.type === 'video') return 'bi-camera-video';
    if (file.type === 'text') {
        if (file.caption.toLowerCase().endsWith('.pdf')) return 'bi-file-pdf';
        if (file.caption.toLowerCase().endsWith('.doc') || file.caption.toLowerCase().endsWith('.docx')) return 'bi-file-word';
        if (file.caption.toLowerCase().endsWith('.xls') || file.caption.toLowerCase().endsWith('.xlsx')) return 'bi-file-excel';
        if (file.caption.toLowerCase().endsWith('.ppt') || file.caption.toLowerCase().endsWith('.pptx')) return 'bi-file-slides';
        return 'bi-file-text';
    }
    return 'bi-file';
}

// Function to get file type badge
function getFileTypeBadge(file) {
    if (file.type === 'video') return 'video-badge';
    if (file.type === 'text') {
        if (file.caption.toLowerCase().endsWith('.pdf')) return 'pdf-badge';
        if (file.caption.toLowerCase().endsWith('.doc') || file.caption.toLowerCase().endsWith('.docx')) return 'doc-badge';
        if (file.caption.toLowerCase().endsWith('.xls') || file.caption.toLowerCase().endsWith('.xlsx')) return 'excel-badge';
        if (file.caption.toLowerCase().endsWith('.ppt') || file.caption.toLowerCase().endsWith('.pptx')) return 'ppt-badge';
        return 'text-badge';
    }
    return 'default-badge';
}

// Function to create a file block
function createFileBlock(file) {
    const dateInfo = formatDate(file.date);
    const fileIcon = getFileIcon(file);
    const badgeClass = getFileTypeBadge(file);
    
    return `
        <div class="file-block ${file.type}-block">
            <div class="file-header">
                <span class="file-type-badge ${badgeClass}">
                    <i class="bi ${fileIcon}"></i>
                    ${file.type.toUpperCase()}
                </span>
                <h4 class="file-title">${file.caption}</h4>
            </div>
            <div class="file-info">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="time-info">
                        <span class="time-badge">
                            <i class="bi bi-clock"></i> ${dateInfo.time}
                        </span>
                        <span class="relative-time">${dateInfo.relative}</span>
                    </div>
                    <div class="file-actions">
                        <small class="text-muted me-2">File ID: ${file.file_id}</small>
                        <i class="bi bi-clipboard copy-button" onclick="copyToClipboard('${file.file_id}')" title="Copy File ID"></i>
                    </div>
                </div>
                <div class="mt-1">
                    <small class="text-muted">Filename: ${file.filename}</small>
                </div>
            </div>
        </div>
    `;
}

// Function to group files by date
function groupFilesByDate(files) {
    const groups = {};
    files.forEach(file => {
        const date = formatDate(file.date).date;
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(file);
    });
    return groups;
}

// Function to render batch content
function renderBatchContent(batchData) {
    const container = document.getElementById('batch-content');
    if (!container) return;

    // Update batch header
    document.getElementById('batch-name').textContent = batchData.name;
    document.getElementById('lecture-count').textContent = `${batchData.lectures.length} Lectures`;
    document.getElementById('document-count').textContent = `${batchData.documents.length} Documents`;
    document.getElementById('folder-size').textContent = batchData.folderSize;

    // Update timeline
    const timelineElement = document.getElementById('batch-timeline');
    if (timelineElement) {
        timelineElement.innerHTML = `
            <i class="bi bi-calendar-event"></i> First: ${batchData.firstDate.date} at ${batchData.firstDate.time}
            <br>
            <i class="bi bi-calendar-check"></i> Last: ${batchData.lastDate.date} at ${batchData.lastDate.time}
        `;
    }

    // Group files by date
    const allFiles = [...batchData.lectures, ...batchData.documents].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );
    const groupedFiles = groupFilesByDate(allFiles);

    // Render files
    let content = '';
    Object.entries(groupedFiles).forEach(([date, files]) => {
        content += `
            <div class="date-group">
                <div class="date-header">
                    <span><i class="bi bi-calendar-date"></i> ${date}</span>
                    <span class="badge bg-secondary">${files.length} files</span>
                </div>
                ${files.map(file => createFileBlock(file)).join('')}
            </div>
        `;
    });

    container.innerHTML = content;
}

// Function to copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('File ID copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

// Load batch data when page loads
document.addEventListener('DOMContentLoaded', () => {
    const batchName = window.location.pathname.split('/').pop();
    if (batchName) {
        fetch(`/api/batch/${batchName}`)
            .then(response => response.json())
            .then(data => renderBatchContent(data))
            .catch(error => console.error('Error loading batch data:', error));
    }
}); 