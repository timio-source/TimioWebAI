import type { CitedSource } from "@shared/schema";
import { Card } from "./card";
import { FileText } from "lucide-react";
import { TextFormatter } from "@/utils/text-formatter";

interface CitedSourcesProps {
  sources: CitedSource[];
}

export function CitedSources({ sources }: CitedSourcesProps) {
  if (!sources || sources.length === 0) {
    return (
      <Card className="shadow-card p-6">
        <h3 className="text-xl font-semibold text-brand-dark mb-6 pb-3 border-b-2 border-black flex items-center">
          <FileText className="h-5 w-5 mr-2 text-brand-blue" />
          Cited Sources
        </h3>
        <div className="text-gray-500 text-sm">No sources available</div>
      </Card>
    );
  }

  return (
    <Card className="shadow-card p-6">
      <h3 className="text-xl font-semibold text-brand-dark mb-6 pb-3 border-b-2 border-black flex items-center">
        <FileText className="h-5 w-5 mr-2 text-brand-blue" />
        Cited Sources
      </h3>
      <div className="space-y-4">
        {sources.map((source) => {
          const SourceWrapper = source.url ? 'a' : 'div';
          const wrapperProps = source.url ? {
            href: source.url,
            target: '_blank',
            rel: 'noopener noreferrer'
          } : {};
          
          return (
            <SourceWrapper
              key={source.id}
              {...wrapperProps}
              className={`group block hover:bg-gray-50 p-2 rounded-lg transition-colors duration-200 ${
                source.url ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="flex space-x-4">
                <img 
                  src={source.imageUrl}
                  alt={source.name}
                  className="w-28 h-20 object-cover rounded-lg flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-1">{source.type}</p>
                  <h4 className={`font-semibold text-sm line-clamp-2 transition-colors duration-200 leading-relaxed ${
                    source.url 
                      ? 'text-black group-hover:text-brand-blue group-hover:underline' 
                      : 'text-black'
                  }`}>
                    {TextFormatter.cleanText(source.name)}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{TextFormatter.cleanText(source.description)}</p>
                  {source.url && (
                    <p className="text-xs text-brand-blue mt-1 group-hover:underline">
                      Click to visit source →
                    </p>
                  )}
                </div>
              </div>
            </SourceWrapper>
          );
        })}
      </div>
    </Card>
  );
}