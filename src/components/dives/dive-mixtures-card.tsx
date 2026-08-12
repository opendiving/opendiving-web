import { Dive } from "@/lib/api/dives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wind } from "lucide-react";

interface DiveMixturesCardProps {
  dive: Dive;
}

/**
 * The dive's gas mixtures, one row per cylinder. Renders nothing when the dive has none,
 * which is the common case for a dive logged by hand.
 *
 * Sits between the depth figures and the gas-consumption card on the detail page: the
 * pressures here are the inputs that card's RMV/SAC are derived from.
 */
export function DiveMixturesCard({ dive }: DiveMixturesCardProps) {
  if (!dive.mixtures || dive.mixtures.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wind className="h-5 w-5" />
          Gas Mixtures
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Start Pressure</TableHead>
                <TableHead>End Pressure</TableHead>
                <TableHead>O₂</TableHead>
                <TableHead>He</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dive.mixtures.map((mixture, index) => (
                <TableRow key={mixture.id ?? index}>
                  <TableCell className="font-medium">
                    {mixture.name || `Tank ${index + 1}`}
                  </TableCell>
                  <TableCell>{mixture.volume} L</TableCell>
                  <TableCell>
                    {mixture.start_pressure != null
                      ? `${mixture.start_pressure} bar`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {mixture.end_pressure != null
                      ? `${mixture.end_pressure} bar`
                      : "-"}
                  </TableCell>
                  <TableCell>{mixture.oxygen}%</TableCell>
                  <TableCell>{mixture.helium}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
