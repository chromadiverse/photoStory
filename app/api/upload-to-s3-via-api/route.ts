import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucketName = formData.get("bucketName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!bucketName) {
      return NextResponse.json({ error: "No bucket name provided" }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileBufferTyped = new Uint8Array(fileBuffer);
    
    const ext = file.type.split("/")[1];
    const uniqueFileName = `${crypto.randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFileName,
      ContentType: file.type,
      Body: fileBufferTyped,
    });

    await s3Client.send(command);

    console.log("=== R2 UPLOAD SUCCESS ===");
    return NextResponse.json({ path: uniqueFileName });

  } catch (error) {
    console.error("=== API Route Error ===", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}