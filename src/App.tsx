import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import Header from "./modules/header/page";
import Login from "./modules/auth/login/page";
import Signup from "./modules/auth/signup/page";
import Otp from "./modules/auth/otp/page";

import { Toaster } from "sonner";
import useUser from "./hooks/userUser";
import { signOut } from "aws-amplify/auth";

type AuthView = "home" | "login" | "signup" | "otp";

const App = () => {
  const [authView, setAuthView] = useState<AuthView>("home");
  const [verificationEmail, setVerificationEmail] = useState("");

  const queryClient = useQueryClient();
  const { user, isLoading } = useUser();

  const handleVerificationRequired = (email: string) => {
    setVerificationEmail(email);
    setAuthView("otp");
  };

  const handleLoginSuccess = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["user"],
    });

    setAuthView("home");
  };




const handleLogout = async () => {
  try {
    await signOut();
    queryClient.removeQueries({ queryKey: ["user"] });
  } catch (error) {
    console.error("Logout failed:", error);
  }
};

const handleSwitchAccount = () => {
  setAuthView("login");
};
  console.log("Fetched user profile:", user);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />

      <Header
      user={user}
      isUserLoading={isLoading}
      onLogin={() => setAuthView("login")}
      onCreateAccount={() => setAuthView("signup")}
      onLogout={handleLogout}
      onSwitchAccount={handleSwitchAccount}
    />

      {authView === "signup" && (
        <Signup
          onSignIn={() => setAuthView("login")}
          onVerificationRequired={handleVerificationRequired}
        />
      )}

      {authView === "login" && (
        <Login
          onSignUp={() => setAuthView("signup")}
          onVerificationRequired={handleVerificationRequired}
          onSuccess={handleLoginSuccess}
        />
      )}

      {authView === "otp" && (
        <Otp
          email={verificationEmail}
          onSuccess={() => setAuthView("login")}
          onBackToLogin={() => setAuthView("login")}
        />
      )}

      {authView === "home" && (
        <main className="flex min-h-[calc(100vh-100px)] items-center justify-center">
          Livestock Health
        </main>
      )}

      <footer className="py-5 text-center text-xs text-foreground/70">
        Livestock Health Platform · Better livestock health through better information.
      </footer>
    </div>
  );
};

export default App;