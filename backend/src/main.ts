import express from "express";
import { errorMiddleware } from "./packages/error-handler/error-middleware.js";
import router from "./routes/page.js";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });



const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.USER_UI_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(cors({
  origin: allowedOrigins,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
}));

// Middleware
app.use(express.json());

// Routes
app.use("/auth", router);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Livestock Health API is running",
  });
});

// Error handling (always after routes)
app.use(errorMiddleware);

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});