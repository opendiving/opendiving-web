"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  supportAPI,
} from "@/lib/api/support";
import { FALLBACK_ISSUES_URL } from "@/lib/support";
import { supportSchema, SupportInput } from "@/lib/validations/support";
import { getApiErrorMessage } from "@/lib/api/error";
import { MailCheck, Send } from "lucide-react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { StatusMessage } from "@/components/ui/status-message";

interface SupportFormProps {
  // Address offered when a send fails, so a broken API isn't a dead end. Optional
  // because it's display-only and can't be derived from anything here - the API owns
  // the real recipient (`CONTACT_FORM_EMAIL`). An instance that hasn't set
  // `CONTACT_EMAIL` gets pointed at the issue tracker instead, which beats an
  // address that reaches someone with no access to that instance.
  fallbackEmail?: string;
}

export function SupportForm({ fallbackEmail }: SupportFormProps) {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SupportInput>({
    resolver: zodResolver(supportSchema),
    defaultValues: {
      name: "",
      email: "",
      category: "support",
      subject: "",
      message: "",
    },
  });

  // A signed-in diver shouldn't have to retype what we already know. Their details
  // only arrive once the auth bootstrap resolves (see `AuthContext`), well after this
  // form first renders, so this is an effect rather than `defaultValues` - and it
  // only fills fields that are still empty, so it can't clobber a fast typist.
  useEffect(() => {
    if (!user) return;
    if (!form.getValues("name")) form.setValue("name", user.name);
    if (!form.getValues("email")) form.setValue("email", user.email);
  }, [user, form]);

  const onSubmit = async (values: SupportInput) => {
    try {
      setError(null);
      await supportAPI.sendRequest(values);
      setSent(true);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "We couldn't send that just now. Please try again in a moment.",
        ),
      );
    }
  };

  if (sent) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <MailCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Message sent</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Thanks - it's on its way. We'll reply to{" "}
          <span className="font-medium text-foreground">
            {form.getValues("email")}
          </span>
          . OpenDiving is maintained by volunteers, so give it a few days before
          assuming it got lost.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            form.reset();
            setSent(false);
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <StatusMessage variant="error">
            {error}{" "}
            {fallbackEmail ? (
              <>
                You can also email us directly at{" "}
                <a href={`mailto:${fallbackEmail}`} className="underline">
                  {fallbackEmail}
                </a>
                .
              </>
            ) : (
              <>
                If it keeps failing, you can{" "}
                <a
                  href={FALLBACK_ISSUES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  open an issue
                </a>{" "}
                instead.
              </>
            )}
          </StatusMessage>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Your name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What's it about?</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUPPORT_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {SUPPORT_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input placeholder="Suunto export won't import" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea
                  rows={8}
                  placeholder="What happened, what you expected, and - for an import problem - which dive computer and export format."
                  className="min-h-[160px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <div className="flex items-center space-x-2">
              <ButtonSpinner />
              <span>Sending...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Send className="h-4 w-4" />
              <span>Send message</span>
            </div>
          )}
        </Button>
      </form>
    </Form>
  );
}
