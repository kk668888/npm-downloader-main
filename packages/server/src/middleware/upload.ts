import fs from "fs";
import multer from "multer";
import path from "path";
import { UPLOAD_DIR } from "./dirs.js";

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer to store files with original filename + timestamp to avoid conflicts
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    // Add timestamp prefix to avoid filename conflicts
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.yaml';
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-]/g, '_');
    cb(null, `${timestamp}-${basename}${ext}`);
  },
});

/** 上传文件大小上限：10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const uploadSingleLockfile = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
}).single("lockfile");
