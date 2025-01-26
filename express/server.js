import express from "express";
import multer from "multer";
import crypto from "crypto";
// import sharp from "sharp";

import { PrismaClient } from "@prisma/client";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import dotenv from "dotenv";
dotenv.config();

const randomImageName = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("hex");

const app = express();
const prisma = new PrismaClient();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

upload.single("image");

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

app.get("/api/posts", async (req, res) => {
  const posts = await prisma.posts.findMany({ orderBy: [{ created: "desc" }] });
  for (const post of posts) {
    post.imageUrl = "https://" + post.imageName; // cdn link
    const getObjectParams = {
      Bucket: bucketName,
      Key: post.imageName,
    };
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    post.imageUrl = url;
  }

  res.send(posts);
});

app.post("/api/posts", upload.single("image"), async (req, res) => {
  console.log("req.body", req.body);
  console.log("req.file", req.file);

  const buffer = req.file.buffer;

  const imageName = randomImageName();
  const params = {
    Bucket: bucketName,
    Key: imageName,
    Body: buffer, // a buffer refers to a block of memory that is used to store pixel data.
    ContentType: req.file.mimetype,
  };
  const command = new PutObjectCommand(params);
  await s3.send(command);

  const post = await prisma.posts.create({
    data: {
      caption: req.body.caption,
      imageName: imageName,
    },
  });

  res.send({ post });
});

app.listen(8080, () => console.log("listening on port 8080"));
