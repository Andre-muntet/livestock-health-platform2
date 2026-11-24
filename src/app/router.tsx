import { createBrowserRouter } from "react-router-dom";

// Import your page components here

export const router = createBrowserRouter([
  {
    path: "/",
    element: <div>Home</div>,
  },
  {
    path: "/login",
    element: <div>Login</div>,
  },
  {
    path: "/signup",
    element: <div>Signup</div>,
  },
  {
    path: "/dashboard",
    element: <div>Dashboard</div>,
  },
  {
    path: "/animals",
    element: <div>Animals</div>,
  },
  {
    path: "/animals/:animalId",
    element: <div>Animal Profile</div>,
  },
]);