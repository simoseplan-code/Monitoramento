import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessaoExpirada } from "@/lib/sessao";
import { origemConfiavel } from "@/lib/seguranca";

const ROTAS_PUBLICAS = ["/login", "/cadastro", "/pendente"];

export async function middleware(request: NextRequest) {
  // Rotas de API cuidam da própria autenticação/rate limit.
  if (request.nextUrl.pathname.startsWith("/api")) {
    // CSRF: pedido que altera dados só é aceito se vier do próprio painel.
    const altera = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (altera && !origemConfiavel(request.headers.get("origin"), request.headers.get("host"))) {
      return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const rotaPublica = ROTAS_PUBLICAS.some((r) => pathname.startsWith(r));

  if (!user) {
    if (rotaPublica) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Sessão velha demais: encerra e manda pro login (ver lib/sessao.ts).
  if (sessaoExpirada(user.last_sign_in_at)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // O signOut limpou os cookies em `response` — leva junto no redirect.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // Usuário logado: verifica status de aprovação para liberar áreas internas.
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status !== "aprovado") {
    if (pathname.startsWith("/pendente")) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/pendente";
    return NextResponse.redirect(url);
  }

  if ((pathname.startsWith("/admin") || pathname.startsWith("/desempenho") || pathname.startsWith("/equipe") || pathname.startsWith("/sobreposicoes")) && !profile.is_admin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
