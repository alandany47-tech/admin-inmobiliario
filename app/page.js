import { redirect } from "next/navigation";
import { getPerfilActual } from "@/app/actions/auth";

export default async function Home() {
  const perfil = await getPerfilActual();

  if (perfil) {
    redirect("/dashboard");
  }

  redirect("/login");
}
