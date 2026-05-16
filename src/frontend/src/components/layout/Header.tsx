import Link from "next/link";
import { ROUTES } from "@/constants";

export function Header() {
  return (
    <header className="border-b border-gray-200 px-6 py-4">
      <nav className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href={ROUTES.HOME} className="text-xl font-bold">
          Tutor AI
        </Link>
        <Link
          href={ROUTES.ONBOARDING}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          Start learning
        </Link>
      </nav>
    </header>
  );
}
