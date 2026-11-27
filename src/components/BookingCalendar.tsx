import { useState } from "react";
import { CalendarDays, Check, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatTimeInTz, TIMEZONE_CHOICES } from "@/lib/interviews";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export function BookingCalendar({
  queryKey,
  loadSlots,
  book,
  suggestedTimezone,
  onBooked,
}: {
  queryKey: string[];
  loadSlots: () => Promise<Array<{ startIso: string; endIso: string }>>;
  book: (startIso: string, timezone: string) => Promise<unknown>;
  suggestedTimezone: string;
  onBooked: () => Promise<unknown>;
}) {
  const [tz, setTz] = useState(suggestedTimezone),
    [day, setDay] = useState<Date>(),
    [selected, setSelected] = useState("");
  const query = useQuery({ queryKey, queryFn: loadSlots, retry: false, refetchInterval: 30000 });
  const key = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const dayKey = day
    ? `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
    : "";
  const days = new Set((query.data ?? []).map((s) => key(s.startIso)));
  const times = (query.data ?? []).filter((s) => key(s.startIso) === dayKey);
  const booking = useMutation({
    mutationFn: () => book(selected, tz),
    onSuccess: async () => {
      setSelected("");
      await onBooked();
    },
    onError: () => void query.refetch(),
  });
  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-4 w-4" />
          Choose your interview time
        </h3>
        <Select
          value={tz}
          onValueChange={(v) => {
            setTz(v);
            setSelected("");
          }}
        >
          <SelectTrigger className="w-full sm:w-60" aria-label="Interview timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONE_CHOICES.map((v) => (
              <SelectItem key={v} value={v}>
                {v.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {query.isPending ? (
        <div className="flex h-80 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : query.error ? (
        <div role="alert" className="text-sm text-destructive">
          {query.error.message}
          <Button variant="outline" className="ml-2" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : !days.size ? (
        <p className="py-8 text-sm text-muted-foreground">
          No interview times are available right now. Please check again later.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <Calendar
            mode="single"
            selected={day}
            onSelect={(v) => {
              setDay(v);
              setSelected("");
            }}
            disabled={(d) =>
              !days.has(
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
              )
            }
            defaultMonth={query.data?.[0] ? new Date(query.data[0].startIso) : new Date()}
            className="mx-auto rounded-md border border-border"
          />
          <div className="min-w-0">
            <p className="mb-3 text-sm font-medium">
              {day
                ? day.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                : "Select an available date"}
            </p>
            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
              {times.map((s) => (
                <Button
                  key={s.startIso}
                  variant={selected === s.startIso ? "default" : "outline"}
                  disabled={booking.isPending}
                  onClick={() => setSelected(s.startIso)}
                >
                  {formatTimeInTz(s.startIso, tz)}
                </Button>
              ))}
            </div>
            {selected && (
              <Button
                className="mt-4 w-full"
                disabled={booking.isPending}
                onClick={() => booking.mutate()}
              >
                {booking.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Confirm interview
              </Button>
            )}
          </div>
        </div>
      )}
      {booking.error && (
        <p role="alert" className="text-sm text-destructive">
          {booking.error.message}
        </p>
      )}
    </div>
  );
}
