import { LucideIcon } from "lucide-react";

export interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
      <Icon className="h-16 w-16 text-gray-400 mx-auto mb-6" />
      <h1 className="text-3xl font-bold text-gray-900 mb-4">{title}</h1>
      <p className="text-xl font-medium text-blue-600 mb-4">Coming soon...</p>
      <p className="text-gray-500">{description}</p>
    </div>
  );
}
