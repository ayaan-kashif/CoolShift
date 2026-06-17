import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { importXLSX, importCSV } from '../services/importer';
import { config } from '../config';

const router = Router();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = config.uploadsDir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// POST /api/v1/import/xlsx - Upload XLSX workbook
router.post('/xlsx', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const result = importXLSX(req.file.path);
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/import/csv - Upload CSV interval inputs
router.post('/csv', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const scenarioId = req.body.scenario_id || req.query.scenario_id;
    const result = importCSV(req.file.path, scenarioId as string);
    fs.unlinkSync(req.file.path);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/import - Fallback that automatically handles CSV/XLSX based on file extension
router.post('/', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const scenarioId = req.body.scenario_id || req.query.scenario_id;
    
    let result;
    if (ext === '.csv') {
      result = importCSV(req.file.path, scenarioId as string);
    } else if (['.xlsx', '.xls'].includes(ext)) {
      result = importXLSX(req.file.path);
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Unsupported file format. Please upload a CSV or XLSX file.' });
    }
    
    fs.unlinkSync(req.file.path);
    res.json(result);
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
