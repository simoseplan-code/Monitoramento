import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_RECUPERACAO, VALIDADE_RECUPERACAO_S, gerarMarcaRecuperacao } from "@/lib/recuperacao";

// Destino do link do e-mail "Redefinir senha":
//   {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery
// Troca o código do e-mail por uma sessão e leva para a tela de nova senha. Funciona em
// qualquer navegador (não depende de o pedido ter sido feito no mesmo).
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tipo = request.nextUrl.searchParams.get("type");
  const erro = () => NextResponse.redirect(new URL("/esqueci-senha?erro=link", request.url));

  if (!tokenHash || tokenHash.length > 300 || tipo !== "recovery") return erro();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error || !data.user) return erro();

  const resposta = NextResponse.redirect(new URL("/redefinir-senha", request.url));
  resposta.cookies.set(COOKIE_RECUPERACAO, gerarMarcaRecuperacao(data.user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VALIDADE_RECUPERACAO_S,
  });
  return resposta;
}
