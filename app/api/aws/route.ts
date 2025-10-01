import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

export async function POST(req: NextRequest) {
  const { bucketName, folderName, fileType } = await req.json()

  const uniqueFileName = `${randomUUID()}.${fileType.split("/")[1]}`

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: folderName ? `${folderName}/${uniqueFileName}` : uniqueFileName,
    ContentType: fileType,
  })

  const s3Client = new S3Client({
    forcePathStyle: true,
    region: process.env.AWS_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  try {
    const signedUrl = await getSignedUrl(s3Client, putCommand)
    return Response.json({ signedUrl, uniqueFileName })
  } catch (error) {
    console.error("Error generating signed URL:", error)
    return Response.json({ message: "Error generating signed URL", error }, { status: 500 })
  }
}