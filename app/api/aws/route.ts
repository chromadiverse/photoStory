import { NextRequest } from "next/server"
import { randomUUID } from "crypto"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,  // ← Virtual-hosted style
})

function stripChecksumParams(rawUrl: string): string {
  const url = new URL(rawUrl)
  
  const paramsToRemove = [
    'x-amz-checksum-crc32',
    'x-amz-sdk-checksum-algorithm',
    'x-amz-checksum-crc32c',
    'x-amz-checksum-sha1',
    'x-amz-checksum-sha256',
    'x-amz-content-sha256',
  ]
  
  paramsToRemove.forEach(param => {
    url.searchParams.delete(param)
  })
  
  const allKeys = [...url.searchParams.keys()]
  allKeys.forEach(key => {
    if (key.toLowerCase().includes('checksum')) {
      url.searchParams.delete(key)
    }
  })
  
  return url.toString()
}

export async function POST(req: NextRequest) {
  const { bucketName, fileType } = await req.json()

  if (!bucketName || !fileType) {
    return Response.json({ message: "bucketName and fileType are required" }, { status: 400 })
  }

  const ext = fileType.split("/")[1]
  const uniqueFileName = `${randomUUID()}.${ext}`
  // IMPORTANTE: key es solo el nombre del archivo
  const key = uniqueFileName

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,  // ← "im-g"
    Key: key,
    ContentType: fileType,
  })

  try {
    const rawSignedUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 })
    const signedUrl = stripChecksumParams(rawSignedUrl)

    return Response.json({ signedUrl, uniqueFileName })
  } catch (error) {
    console.error("Error generando signed URL:", error)
    return Response.json({ message: "Error generating signed URL" }, { status: 500 })
  }
}