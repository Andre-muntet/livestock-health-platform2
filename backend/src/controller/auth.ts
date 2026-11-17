import { NextFunction, Request, Response } from "express";

import { AuthenticationError, ValidationError } from "../packages/error-handler/error-middleware.ts";
import prisma from "../packages/prisma/index.ts";
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";


interface CognitoUserInfo {
  sub: string;
  name: string;
  email: string;
  email_verified: boolean;
}



const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "af-south-1",
});

const getCognitoUserInfo = async (
  accessToken: string
): Promise<CognitoUserInfo> => {
  const response = await cognitoClient.send(
    new GetUserCommand({
      AccessToken: accessToken,
    })
  );

  const attributes = Object.fromEntries(
    (response.UserAttributes ?? []).map((attribute) => [
      attribute.Name,
      attribute.Value,
    ])
  );

  return {
    sub: attributes.sub!,
    email: attributes.email!,
    name: attributes.name ?? "",
    email_verified: attributes.email_verified === "true",
  };
};

export const confirmUserProfile = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log("Confirm user profile endpoint reached.");

    if (!req.user) {
      throw new AuthenticationError("Authentication required");
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        cognitoId: req.user.sub,
      },
    });

    if (existingUser) {
      return res.status(200).json({
        message: "User profile confirmed successfully",
      });
    }

    const authorization = req.headers.authorization;
    const [scheme, accessToken] = authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !accessToken) {
      throw new AuthenticationError("Valid access token required");
    }

    const cognitoUser = await getCognitoUserInfo(accessToken);

    if (cognitoUser.sub !== req.user.sub) {
      throw new AuthenticationError("Cognito identity mismatch");
    }

    if (!cognitoUser.name || !cognitoUser.email) {
      throw new Error("Required Cognito user attributes are unavailable");
    }

     await prisma.user.create({
      data: {
        cognitoId: cognitoUser.sub,
        name: cognitoUser.name,
        email: cognitoUser.email,
      },
    });

    return res.status(201).json({
      message: "User profile created successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AuthenticationError("Authentication required");
    }

    console.log("Get user profile endpoint reached for user:", req.user.sub);

    const user = await prisma.user.findUnique({
      where: {
        cognitoId: req.user.sub,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new ValidationError("User profile not found");
    }

    return res.status(200).json({
      message: "User retrieved successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};