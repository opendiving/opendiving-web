/**
 * What the dashboard's two chart cards take. `pending` is set when a card is
 * rendered inside a route loading fallback: hold the pre-data shape and make no
 * request, because the page mounting behind this one makes it.
 */
export interface ChartCardProps {
  pending?: boolean;
}
