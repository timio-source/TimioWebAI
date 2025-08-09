import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Article from "@/pages/article";
import Feed from "@/pages/feed";
import ResearchLoadingPage from "@/pages/research-loading";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Feed} />
      <Route path="/research-loading" component={ResearchLoadingPage} />
      <Route path="/article/:slug" component={Article} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
