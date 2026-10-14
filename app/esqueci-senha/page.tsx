"use client";

import Link from "next/link";
import { useState } from "react";
import { Turnstile } from "@/components/Turnstile";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  // Link do e-mail vencido ou já usado volta para cá com ?erro=link.
  const linkInvalido = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("erro") === "link";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const resp = await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: token }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) {
        setErro(data.error ?? "Não foi possível enviar agora.");
        return;
      }
      setEnviado(true);
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  if (enviado) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">Confira o seu e-mail</h1>
        <p className="text-slate-600">
          Se esse e-mail tiver cadastro aprovado, enviamos um link para criar uma nova senha. Ele vale por pouco tempo e só funciona uma vez. Veja
          também a caixa de spam.
        </p>
        <Link href="/login" className="font-medium text-slate-900 underline">
          Voltar para o login
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Esqueci minha senha</h1>
        <p className="text-sm text-slate-500">Informe o e-mail do seu cadastro e enviaremos um link para criar uma nova senha.</p>
      </div>

      {linkInvalido && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">Esse link venceu ou já foi usado. Peça um novo abaixo.</p>}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        />
        <Turnstile onToken={setToken} />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button type="submit" disabled={carregando} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
          {carregando ? "Enviando..." : "Enviar link"}
        </button>
      </form>

      <Link href="/login" className="text-sm text-slate-500 underline">
        Voltar para o login
      </Link>
    </main>
  );
}
