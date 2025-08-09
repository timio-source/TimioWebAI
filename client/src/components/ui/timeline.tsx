import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextFormatter } from "@/utils/text-formatter";
import type { TimelineItem } from "@shared/schema";

interface TimelineProps {
  items: TimelineItem[];
}

export function Timeline({ items }: TimelineProps) {
  return (
    <Card className="shadow-card p-6">
      <h3 className="text-xl font-semibold text-brand-dark mb-6 pb-3 border-b-2 border-black flex items-center">
        <Clock className="h-5 w-5 mr-2 text-brand-blue" />
        Timeline
      </h3>
      <div className="space-y-6">
        {items.map((item, index) => (
          <div key={item.id} className="relative pl-8">
            <div className="absolute left-0 top-1 w-3 h-3 bg-brand-blue rounded-full" />
            {index < items.length - 1 && (
              <div className="absolute left-1.5 top-4 w-0.5 h-16 bg-gray-200" />
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="font-medium text-brand-dark">
                  {new Date(item.date).toLocaleDateString('en-US', { 
                    timeZone: 'UTC',
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric'
                  })}
                </span>
                <span className="text-muted">•</span>
                <span className="text-muted">Source:</span>
                {item.sourceUrl ? (
                  <a 
                    href={item.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-medium transition-colors hover:text-blue-600"
                  >
                    {item.sourceLabel}
                  </a>
                ) : (
                  <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
                    {item.sourceLabel}
                  </span>
                )}
              </div>
              <h4 className="font-medium text-brand-dark leading-relaxed">{TextFormatter.cleanText(item.title)}</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{TextFormatter.cleanText(item.description)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
