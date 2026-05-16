import { redirect } from "next/navigation";
import { ROUTES } from "@/constants";

export default function Home() {
  redirect(ROUTES.ONBOARDING);
}
