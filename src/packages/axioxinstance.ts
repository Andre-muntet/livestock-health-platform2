import axios, { AxiosInstance } from "axios";

declare module "axios" {
  interface AxiosRequestConfig {
    requireAuth?: boolean;
  }

  interface InternalAxiosRequestConfig {
    requireAuth?: boolean;
  }
}

export const userAxios: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});