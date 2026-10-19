import { redirect } from "next/navigation";

// Le garde d'accès de l'application renvoie vers /connexion si aucune session n'est ouverte.
export default function Home() {
  redirect("/dashboard");
}
