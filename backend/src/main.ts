import express from "express";
import { errorMiddleware } from "./packages/error-handler/error-middleware.js";
import router from "./routes/page.js";
import { prisma } from "./packages/config/prisma.js";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.USER_UI_URL,
  "http://localhost:5173",
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

// Animals routes
app.get("/animals", async (req, res, next) => {
  try {
    const animals = await prisma.animal.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(animals);
  } catch (err) {
    next(err);
  }
});

app.post("/animals", async (req, res, next) => {
  try {
    const { tagNumber, name, species, breed, vaccinationStatus, notes, ownerId } = req.body;
    const created = await prisma.animal.create({
      data: {
        tagNumber,
        name,
        species,
        breed,
        vaccinationStatus,
        notes,
        ownerId,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Alerts routes
app.get("/alerts", async (req, res, next) => {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(alerts);
  } catch (err) {
    next(err);
  }
});

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