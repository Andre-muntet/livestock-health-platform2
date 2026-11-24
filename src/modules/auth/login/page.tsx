
import { useState } from "react";
import { fetchAuthSession, getCurrentUser, signIn,signOut } from "aws-amplify/auth";
import { toast } from "sonner";
import { userAxios } from "../../../packages/axioxinstance";
import { useQueryClient } from "@tanstack/react-query";

interface LoginProps {
  onSignUp: () => void;
  onVerificationRequired: (email: string) => void;
  onSuccess: () => void;
}

const Login = ({
  onSignUp,
  onVerificationRequired,
  onSuccess,
}: LoginProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
 const queryClient = useQueryClient();



const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  try {
    setLoading(true);

  const existingSession = await fetchAuthSession();

if (existingSession.tokens?.accessToken) {
  const currentUser = await getCurrentUser();

  console.log("Current signed-in user:", currentUser);

  if (
    currentUser.signInDetails?.loginId?.toLowerCase() ===
    email.trim().toLowerCase()
  ) {
    toast.error("You are already signed in.");
    return;
  }

  await signOut();
  queryClient.removeQueries({ queryKey: ["user"] });
}

    // 2. Authenticate with the newly entered credentials
    const result = await signIn({
      username: email.trim(),
      password,
    });

    // 3. Handle unconfirmed accounts
    if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
      onVerificationRequired(email.trim());
      return;
    }

    // 4. Ensure sign-in is complete
    if (!result.isSignedIn) {
      toast.error(
        `Additional sign-in step required: ${result.nextStep.signInStep}`
      );
      return;
    }

    

    // 5. Retrieve access token
    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken?.toString();

    if (!accessToken) {
      throw new Error("Access token unavailable.");
    }

const payload = JSON.parse(atob(accessToken.split(".")[1]));
console.log("Access token scopes:", payload.scope);

    // 6. Confirm or create application user profile
    const response = await userAxios.post(
      "/auth/confirm-profile",
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    console.log("User profile response:", response.data);

    // 7. Enter the application only after backend success
    toast.success("Signed in successfully!");
    onSuccess();

  } catch (err) {
      if (err instanceof Error) {
        if (err.name === "UserNotConfirmedException") {
          onVerificationRequired(email.trim());
        } else if (err.name === "UserNotFoundException") {
          toast.error("No account found with this email address.");
        } else if (err.name === "NotAuthorizedException") {
          toast.error("Incorrect email or password.");
        } else if (
          err.name === "UserAlreadyAuthenticatedException" ||
          err.message.toLowerCase().includes("already signed in")
        ) {
          onSuccess();
        } else {
          console.error("Sign-in error:", err);
          toast.error(err.message);
        }
      } else {
        toast.error("Unable to sign in. Please try again.");
      }
    } finally {
      setLoading(false);
    
  }
};



  return (
    <div className="flex min-h-[calc(100vh-100px)] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-foreground">
          Sign in
        </h1>

        <p className="mb-6 text-sm text-foreground/70">
          Welcome back. Sign in to your account.
        </p>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Email address
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 outline-none focus:border-primary"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Password
            </label>

            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 outline-none focus:border-primary"
              autoComplete="current-password"
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground/70">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="accent-primary"
            />
            Show password
          </label>

    

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/70">
          Don't have an account?{" "}
          <button
            type="button"
            onClick={onSignUp}
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
