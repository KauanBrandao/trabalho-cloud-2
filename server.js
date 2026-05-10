require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 3000;

// S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;

// Multer: store in memory before sending to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// POST /upload — upload a file to S3
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided." });
  }

  const key = `${Date.now()}-${req.file.originalname}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    res.json({
      message: "File uploaded successfully.",
      key,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload file." });
  }
});

// GET /files — list all files in the bucket
app.get("/files", async (req, res) => {
  try {
    const data = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET })
    );

    const files = (data.Contents || []).map((obj) => ({
      key: obj.Key,
      name: obj.Key.replace(/^\d+-/, ""), // strip timestamp prefix
      size: obj.Size,
      lastModified: obj.LastModified,
    }));

    res.json(files);
  } catch (err) {
    console.error("List error:", err);
    res.status(500).json({ error: "Failed to list files." });
  }
});

// GET /files/:key/url — generate a presigned download URL (1h expiry)
app.get("/files/:key/url", async (req, res) => {
  try {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: req.params.key }),
      { expiresIn: 3600 }
    );
    res.json({ url });
  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ error: "Failed to generate download URL." });
  }
});

// DELETE /files/:key — delete a file from S3
app.delete("/files/:key", async (req, res) => {
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: req.params.key })
    );
    res.json({ message: "File deleted." });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete file." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
