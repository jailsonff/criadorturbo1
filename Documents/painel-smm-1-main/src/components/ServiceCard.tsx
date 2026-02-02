import { RefreshCw, Ban, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Service } from "@/lib/api";
import { Link } from "react-router-dom";

interface ServiceCardProps {
  service: Service;
}

const ServiceCard = ({ service }: ServiceCardProps) => {
  return (
    <div className="glass rounded-xl p-5 border border-border/50 glass-hover group">
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between mb-3">
          <Badge variant="secondary" className="text-xs">
            {service.category}
          </Badge>
          <div className="flex gap-1">
            {service.refill && (
              <Badge variant="outline" className="text-xs border-success/50 text-success">
                <RefreshCw className="w-3 h-3 mr-1" />
                Refill
              </Badge>
            )}
            {service.cancel && (
              <Badge variant="outline" className="text-xs border-warning/50 text-warning">
                <Ban className="w-3 h-3 mr-1" />
                Cancel
              </Badge>
            )}
          </div>
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
          {service.name}
        </h3>

        <p className="text-sm text-muted-foreground mb-4">
          Tipo: {service.type}
        </p>

        <div className="mt-auto space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Preço:</span>
            <span className="text-primary font-bold text-lg">
              ${service.rate}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Quantidade:</span>
            <span className="text-foreground">
              {service.min} - {service.max}
            </span>
          </div>

          <Link to={`/new-order?service=${service.service}`}>
            <Button className="w-full mt-2 group/btn" variant="default">
              Fazer Pedido
              <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ServiceCard;
