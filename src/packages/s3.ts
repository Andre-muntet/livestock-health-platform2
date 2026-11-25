import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { fetchAuthSession } from "aws-amplify/auth";

export const uploadAnimalImage = async (file: File) => {
  const session = await fetchAuthSession();

  if (!session.credentials || !session.identityId) {
    throw new Error("AWS credentials or identity ID unavailable.");
  }


  const s3 = new S3Client({
    region: "af-south-1",
    credentials: session.credentials,
  });

  try {
    const extension = file.name.split(".").pop();

    const fileName = `${crypto.randomUUID()}.${extension}`;

    const key = `animals/${session.identityId}/${fileName}`;

    // Convert browser File into Uint8Array
    const fileBuffer = new Uint8Array(await file.arrayBuffer());

    await s3.send(
      new PutObjectCommand({
        Bucket: "livestock-health-images-956315449467-af-south-1-an",
        Key: key,
        Body: fileBuffer,
        ContentType: file.type,
      })
    );

    return key;
  } finally {
    s3.destroy();
  }
};