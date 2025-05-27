const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const moment = require('moment');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "img-src": ["'self'", "data:", "https:"],
            "script-src": ["'self'", "'unsafe-inline'", "https:"],
            "style-src": ["'self'", "'unsafe-inline'", "https:"],
        },
    },
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration with default MemoryStore
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Utility functions
const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFolderSize = async (dirPath) => {
    try {
        const files = await fs.readdir(dirPath);
        let totalSize = 0;
        
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isDirectory()) {
                totalSize += await getFolderSize(filePath);
            } else {
                totalSize += stats.size;
            }
        }
        
        return totalSize;
    } catch (error) {
        console.error('Error calculating folder size:', error);
        return 0;
    }
};

const generateSafeFilename = (caption, date) => {
    if (!caption) return `file_${moment(date).format('YYYY-MM-DD_HH-mm')}`;
    return caption
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .substring(0, 50) + '_' + moment(date).format('YYYY-MM-DD_HH-mm');
};

const formatDateForDisplay = (dateString) => {
    const date = moment(dateString);
    return {
        date: date.format('MMMM D, YYYY'),
        time: date.format('h:mm A'),
        timestamp: date.format('YYYY-MM-DD HH:mm:ss'),
        relative: date.fromNow()
    };
};

// Data processing functions
const processBatchData = async (messages) => {
    const batches = {};
    
    // Convert messages object to array of entries
    const messageEntries = Object.entries(messages);
    
    for (const [msgId, message] of messageEntries) {
        const batch = message.batch || 'default';
        if (!batches[batch]) {
            batches[batch] = {
                name: batch,
                lectures: [],
                documents: [],
                firstDate: null,
                lastDate: null,
                totalSize: 0
            };
        }

        const fileEntry = {
            id: msgId,
            type: message.type || 'unknown',
            file_id: message.file_id,
            caption: message.caption || 'Untitled',
            date: message.date,
            originalDate: message.date,
            filename: generateSafeFilename(message.caption, message.date),
            username: message.username || 'Unknown'
        };

        const date = moment(message.date);
        if (!batches[batch].firstDate || date.isBefore(batches[batch].firstDate)) {
            batches[batch].firstDate = date;
        }
        if (!batches[batch].lastDate || date.isAfter(batches[batch].lastDate)) {
            batches[batch].lastDate = date;
        }

        if (message.type === 'video') {
            batches[batch].lectures.push(fileEntry);
        } else if (message.type === 'text') {
            batches[batch].documents.push(fileEntry);
        }
    }

    // Sort files by date
    for (const batch of Object.values(batches)) {
        batch.lectures.sort((a, b) => moment(b.date) - moment(a.date));
        batch.documents.sort((a, b) => moment(b.date) - moment(a.date));
        
        // Format dates for display
        batch.firstDate = formatDateForDisplay(batch.firstDate);
        batch.lastDate = formatDateForDisplay(batch.lastDate);
    }

    return batches;
};

// Routes
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login');
});

app.post('/login', (req, res) => {
    const { name } = req.body;
    if (name && name.trim()) {
        req.session.user = {
            name: name.trim(),
            loginTime: new Date()
        };
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', requireAuth, async (req, res, next) => {
    try {
        const messages = await fs.readJson(path.join(__dirname, 'message_batch.json'));
        const batches = await processBatchData(messages);
        res.render('index', { 
            title: 'Lecture Organizer',
            batches: Object.values(batches),
            formatFileSize,
            moment,
            user: req.session.user
        });
    } catch (error) {
        next(error);
    }
});

app.get('/batch/:name', requireAuth, async (req, res, next) => {
    try {
        const messages = await fs.readJson(path.join(__dirname, 'message_batch.json'));
        const batches = await processBatchData(messages);
        const batch = batches[req.params.name];
        
        if (!batch) {
            return next(new Error('Batch not found'));
        }

        res.render('batch', { 
            title: `${batch.name} - Lecture Organizer`,
            batch,
            formatFileSize,
            moment,
            user: req.session.user
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/batch/:name', requireAuth, async (req, res, next) => {
    try {
        const messages = await fs.readJson(path.join(__dirname, 'message_batch.json'));
        const batches = await processBatchData(messages);
        const batch = batches[req.params.name];
        
        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        res.json(batch);
    } catch (error) {
        next(error);
    }
});

// Books route
app.get('/books', requireAuth, async (req, res, next) => {
    try {
        const fileStore = await fs.readJson(path.join(__dirname, 'file_store_batch.json'));
        
        // Group files by batch
        const batches = {};
        Object.entries(fileStore).forEach(([fileId, file]) => {
            const batch = file.batch || 'Uncategorized';
            if (!batches[batch]) {
                batches[batch] = [];
            }
            batches[batch].push({
                id: fileId,
                name: file.name,
                size: file.size,
                upload_date: file.upload_date,
                file_id: file.id
            });
        });

        // Sort files within each batch by upload date
        Object.keys(batches).forEach(batch => {
            batches[batch].sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
        });

        res.render('books', {
            title: 'Books Library',
            batches,
            formatDateForDisplay,
            user: req.session.user
        });
    } catch (error) {
        next(error);
    }
});

// Books batch route
app.get('/books/:batch', requireAuth, async (req, res, next) => {
    try {
        const fileStore = await fs.readJson(path.join(__dirname, 'file_store_batch.json'));
        
        // Group files by batch
        const batches = {};
        Object.entries(fileStore).forEach(([fileId, file]) => {
            const batch = file.batch || 'Uncategorized';
            if (!batches[batch]) {
                batches[batch] = [];
            }
            batches[batch].push({
                id: fileId,
                name: file.name,
                size: file.size,
                upload_date: file.upload_date,
                file_id: file.id
            });
        });

        // Sort files within each batch by upload date
        Object.keys(batches).forEach(batch => {
            batches[batch].sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
        });

        const batch = req.params.batch;
        if (!batches[batch]) {
            return next(new Error('Batch not found'));
        }

        res.render('books_batch', {
            title: `${batch} - Books Library`,
            batch,
            files: batches[batch],
            formatFileSize,
            formatDateForDisplay,
            user: req.session.user
        });
    } catch (error) {
        next(error);
    }
});

// Dashboard route
app.get('/dashboard', requireAuth, async (req, res, next) => {
    try {
        const messages = await fs.readJson(path.join(__dirname, 'message_batch.json'));
        const batches = await processBatchData(messages);
        res.render('dashboard', {
            title: 'Dashboard - CBSEIANS',
            user: req.session.user,
            batches: Object.values(batches)
        });
    } catch (error) {
        next(error);
    }
});

// Add route for /batch to show all batches
app.get('/batch', requireAuth, async (req, res, next) => {
    try {
        const messages = await fs.readJson(path.join(__dirname, 'message_batch.json'));
        const batches = await processBatchData(messages);
        res.render('index', { 
            title: 'Lecture Organizer',
            batches: Object.values(batches),
            formatFileSize,
            moment,
            user: req.session.user
        });
    } catch (error) {
        next(error);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 
