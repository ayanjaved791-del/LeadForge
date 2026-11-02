import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-bold text-gray-200 dark:text-gray-800">404</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-800 dark:text-white/90">Page not found</h1>
      <p className="mt-1 text-sm text-gray-500">The page you are looking for doesn't exist or was moved.</p>
      <Button className="mt-6" asChild><Link to="/">Back to dashboard</Link></Button>
    </div>
  );
}
