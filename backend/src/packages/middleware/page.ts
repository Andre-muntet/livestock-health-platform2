
import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { AuthenticationError } from "../error-handler/error-middleware.js";
import "dotenv/config";

// Cognito access-token verifier
const cognitoVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: "access",
  clientId: process.env.COGNITO_CLIENT_ID!,
});

// Make Cognito identity available on Express requests
declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
      };
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    // Check for Bearer token
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError("Access token required");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      throw new AuthenticationError("Access token required");
    }

    // Verify Cognito access token
    const payload = await cognitoVerifier.verify(token);

    // Attach verified identity to request
    req.user = {
      sub: payload.sub,
    };

    next();

  } catch (error) {
    if (error instanceof AuthenticationError) {
      return next(error);
    }

    return next(
      new AuthenticationError("Invalid or expired access token")
    );
  }
};
