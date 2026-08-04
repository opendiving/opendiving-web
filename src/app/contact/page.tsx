import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Metadata } from "next";
import {
  Mail,
  MessageSquare,
  Bug,
  Users,
  BookOpen,
  Shield,
  Heart,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us | OpenDiving",
  description:
    "Get in touch with the OpenDiving community. Find support, report issues, or contribute to our open-source diving platform.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header showDashboardActions={true} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Get in Touch
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            OpenDiving is built by the community, for the community. Whether you
            need help, want to contribute, or have feedback, we'd love to hear
            from you.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Methods */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2 text-blue-600" />
                  Community Support
                </CardTitle>
                <CardDescription>
                  Get help from our diving community
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 mb-4">
                  Join our community discussions for general questions, diving
                  tips, and platform support.
                </p>
                <Button asChild className="w-full">
                  <Link href="https://github.com/opendiving/discussions">
                    Join Discussions
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bug className="h-5 w-5 mr-2 text-gray-700" />
                  Technical Issues
                </CardTitle>
                <CardDescription>
                  Report bugs or request features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 mb-4">
                  Found a bug or have a feature request? Create an issue on our
                  GitHub repository.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="https://github.com/opendiving/opendiving/issues">
                    Report Issue
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Heart className="h-5 w-5 mr-2 text-red-500" />
                  Contributing
                </CardTitle>
                <CardDescription>Help make OpenDiving better</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 mb-4">
                  Want to contribute code, documentation, or translations? Check
                  out our contributing guide.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="https://github.com/opendiving/opendiving/blob/main/CONTRIBUTING.md">
                    Contribute
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Mail className="h-5 w-5 mr-2 text-blue-600" />
                  Send Us a Message
                </CardTitle>
                <CardDescription>
                  For general inquiries, partnerships, or other matters
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input id="name" placeholder="Your full name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your.email@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="What's this about?"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <select
                      id="category"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      required
                    >
                      <option value="">Select a category</option>
                      <option value="support">General Support</option>
                      <option value="bug">Bug Report</option>
                      <option value="feature">Feature Request</option>
                      <option value="partnership">Partnership</option>
                      <option value="safety">Safety Concern</option>
                      <option value="legal">Legal/Privacy</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <textarea
                      id="message"
                      placeholder="Tell us more about your inquiry..."
                      rows={6}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      required
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <p className="text-blue-800 text-sm">
                      <strong>Note:</strong> For urgent safety concerns or
                      emergencies, please contact your local emergency services
                      immediately. OpenDiving is not an emergency service.
                    </p>
                  </div>

                  <Button type="submit" className="w-full">
                    <Mail className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Additional Contact Information */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Users className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 mb-2">
                  Community Managers
                </h3>
                <p className="text-gray-600 text-sm">
                  community@opendiving.app
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Shield className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 mb-2">
                  Security Issues
                </h3>
                <p className="text-gray-600 text-sm">security@opendiving.app</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <BookOpen className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 mb-2">
                  Documentation
                </h3>
                <p className="text-gray-600 text-sm">docs@opendiving.app</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Response Time Note */}
        <div className="mt-12 text-center">
          <p className="text-gray-600">
            OpenDiving is an open-source project maintained by volunteers from
            the diving community.
          </p>
          <p className="text-gray-600 mt-2">
            Response times may vary, but we typically respond within 48-72
            hours.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
