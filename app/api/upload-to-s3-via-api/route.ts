import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
//lol
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
    const folderName = formData.get("folderName") as string || "im-g";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!bucketName) {
      return NextResponse.json({ error: "No bucket name provided" }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileBufferTyped = new Uint8Array(fileBuffer);

    const mimeType = file.type;
    const ext = mimeType.includes("/") ? mimeType.split("/")[1].split("+")[0] : "bin";
    const uniqueFileName = `${folderName}/${crypto.randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFileName,
      ContentType: mimeType,
      Body: fileBufferTyped,
    });

    await s3Client.send(command);

    const publicBase = process.env.S3_PUBLIC_URL!.replace(/\/$/, "");
    const publicUrl = `${publicBase}/${uniqueFileName}`;

    return NextResponse.json({
      path: uniqueFileName,
      url: publicUrl,
    });

  } catch (error) {
    console.error("=== API Route Error ===", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}