import React, { useState, useCallback, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";

interface LoginPageProps {
  error: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
}

export function LoginPage({ error, onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!username.trim() || !password.trim()) return;
      setSubmitting(true);
      try {
        await onLogin(username.trim(), password);
      } catch {
        // Error is handled by the auth store
      } finally {
        setSubmitting(false);
      }
    },
    [username, password, onLogin]
  );

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        bgcolor: "var(--vscode-editor-background, #1e1e1e)",
        color: "var(--vscode-editor-foreground, #d4d4d4)"
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          width: 360,
          bgcolor: "var(--vscode-sideBar-background, #252526)",
          color: "var(--vscode-editor-foreground, #d4d4d4)"
        }}
      >
        <Typography variant="h5" sx={{ mb: 3, textAlign: "center" }}>
          Containerlab GUI
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            autoFocus
            sx={{ mb: 2 }}
            slotProps={{
              inputLabel: { shrink: true }
            }}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            sx={{ mb: 3 }}
            slotProps={{
              inputLabel: { shrink: true }
            }}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={submitting || !username.trim() || !password.trim()}
          >
            {submitting ? "Logging in..." : "Login"}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
