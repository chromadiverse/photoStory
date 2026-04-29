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
})

function stripChecksumParams(rawUrl: string): string {
  console.log("=== [stripChecksumParams] URL original ===")
  console.log(rawUrl)
  
  const url = new URL(rawUrl)
  
  console.log("=== [stripChecksumParams] Parámetros encontrados ===")
  console.log([...url.searchParams.keys()])
  
  const paramsToRemove = [
    'x-amz-checksum-crc32',
    'x-amz-sdk-checksum-algorithm',
    'x-amz-checksum-crc32c',
    'x-amz-checksum-sha1',
    'x-amz-checksum-sha256',
    'x-amz-content-sha256',
  ]
  
  paramsToRemove.forEach(param => {
    if (url.searchParams.has(param)) {
      console.log(`Eliminando: ${param}`)
      url.searchParams.delete(param)
    }
  })
  
  // Eliminar cualquier parámetro que tenga "checksum"
  const allKeys = [...url.searchParams.keys()]
  allKeys.forEach(key => {
    if (key.toLowerCase().includes('checksum')) {
      console.log(`Eliminando (checksum): ${key}`)
      url.searchParams.delete(key)
    }
  })
  
  const cleanUrl = url.toString()
  console.log("=== [stripChecksumParams] URL limpia ===")
  console.log(cleanUrl)
  
  return cleanUrl
}

export async function POST(req: NextRequest) {
  console.log("=== /api/aws RECIBIDO ===")
  const { bucketName, folderName, fileType } = await req.json()
  console.log("bucketName:", bucketName)
  console.log("folderName:", folderName)
  console.log("fileType:", fileType)

  if (!bucketName || !fileType) {
    return Response.json({ message: "bucketName and fileType are required" }, { status: 400 })
  }

  const ext = fileType.split("/")[1]
  const uniqueFileName = `${randomUUID()}.${ext}`
  const key = folderName ? `${folderName}/${uniqueFileName}` : uniqueFileName

  console.log("key:", key)

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: fileType,
  })

  try {
    const rawSignedUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 })
    console.log("=== rawSignedUrl generada ===")
    
    const signedUrl = stripChecksumParams(rawSignedUrl)
    
    console.log("=== URL final devuelta ===")
    console.log(signedUrl)

    return Response.json({ signedUrl, uniqueFileName })
  } catch (error) {
    console.error("Error generando signed URL:", error)
    return Response.json({ message: "Error generating signed URL" }, { status: 500 })
  }
}