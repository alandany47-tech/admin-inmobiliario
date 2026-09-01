import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const RUTAS_PUBLICAS = ["/login"];
const RUTA_CAMBIAR_PASSWORD = "/cambiar-password";

/** Refresca la sesión de Supabase, redirige a /login si no hay usuario autenticado, y a /cambiar-password si tiene pendiente el cambio obligatorio. */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
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

  const path = request.nextUrl.pathname;
  const esRutaPublica = RUTAS_PUBLICAS.includes(path);

  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && !esRutaPublica && path !== RUTA_CAMBIAR_PASSWORD) {
    const { data: perfil } = await supabase
      .from("perfiles_usuario")
      .select("debe_cambiar_password")
      .eq("id", user.id)
      .single();

    if (perfil?.debe_cambiar_password) {
      const url = request.nextUrl.clone();
      url.pathname = RUTA_CAMBIAR_PASSWORD;
      return NextResponse.redirect(url);
    }
  }

  return response;
}
