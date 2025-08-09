import { useState } from "react";
import { ChevronDown, Database, Users, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ExpandableSectionProps {
  title: string;
  icon: "database" | "users" | "conflict" | "pivot" | "document";
  content: React.ReactNode;
  customIcon?: string;
  defaultOpen?: boolean;
}

export function ExpandableSection({ title, icon, content, customIcon, defaultOpen = false }: ExpandableSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const renderIcon = () => {
    if (customIcon) {
      return (
        <div className="h-10 w-10 bg-black rounded-full flex items-center justify-center mr-3">
          <img 
            src={customIcon} 
            alt={title} 
            className="h-6 w-6 object-contain"
          />
        </div>
      );
    }

    const iconMap: Record<ExpandableSectionProps["icon"], React.ElementType> = {
      database: Database,
      users: Users,
      conflict: Users,
      pivot: Users, // Replace with the correct icon if needed
      document: FileText,
    };
    
    const IconComponent = iconMap[icon] || Users; // Fallback to Users if icon is invalid

    return (
      <div className="h-10 w-10 theme-icon-bg rounded-full flex items-center justify-center mr-3">
        <IconComponent className="h-6 w-6 text-white" />
      </div>
    );
  };

  return (
    <Card className="bg-white border-2 border-gray-200 shadow-card hover:shadow-card-hover transition-shadow duration-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 text-left hover:bg-gray-50 transition-colors duration-200 flex items-center justify-between"
      >
        <div className="flex items-center">
          {renderIcon()}
          <h3 className="text-xl font-semibold theme-research-card-header-text">{title}</h3>
        </div>
        <ChevronDown 
          className={`h-5 w-5 theme-muted-text transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      
      {isOpen && (
        <CardContent className="p-6 pt-0 bg-transparent border-t border-gray-200 animate-slide-up">
          {content}
        </CardContent>
      )}
    </Card>
  );
}
