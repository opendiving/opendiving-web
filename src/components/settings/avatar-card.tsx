"use client";

import { useEffect, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import { Camera, Trash2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  authAPI,
  AVATAR_ACCEPT,
  AVATAR_EXPORT_SIZE,
  MAX_AVATAR_UPLOAD_SIZE,
} from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { cropToBlob, decodeImage, ImageCropError } from "@/lib/image-crop";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

/**
 * The diver's own picture: pick a photo, adjust the crop, save.
 *
 * Saves immediately rather than riding the profile form's submit, which is why it is
 * a card of its own and not a field in that form - the header avatar changes in the
 * same paint, and a Save button between the diver and a change they can already see
 * is the thing the units and notifications cards deleted too.
 *
 * Remove has no confirmation step. Re-uploading undoes it, and nothing is lost that
 * the diver does not still have on their phone.
 */
export function AvatarCard() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URL of the file being cropped; also what decides whether the dialog is
  // mounted. Held rather than derived so it can be revoked - an object URL is kept
  // alive by the document until it is released explicitly.
  const [pickedUrl, setPickedUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (!pickedUrl) return;
    return () => URL.revokeObjectURL(pickedUrl);
  }, [pickedUrl]);

  const showError = (err: unknown, fallback: string) => {
    toast({
      title: "Error",
      // A failure raised in this browser carries its own message and has no
      // response for `getApiErrorMessage` to read, which would swap it for the
      // fallback. Only the API's failures go through that.
      description:
        err instanceof ImageCropError
          ? err.message
          : getApiErrorMessage(err, fallback),
      variant: "destructive",
    });
  };

  const handlePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared unconditionally, so picking the *same* file again after a cancel
    // still fires a change event.
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_AVATAR_UPLOAD_SIZE) {
      toast({
        title: "That photo is too large",
        description: `Pick one under ${MAX_AVATAR_UPLOAD_SIZE / (1024 * 1024)} MB.`,
        variant: "destructive",
      });
      return;
    }

    const url = URL.createObjectURL(file);

    // Decode before opening the dialog rather than discovering the problem
    // inside it. `react-easy-crop` has no failure callback at all - bytes it
    // cannot decode leave it showing an empty frame with a Save button that
    // never enables and nothing said about why, and the only escape is Cancel.
    // The live case is a HEIC picked through the iOS Files app, which bypasses
    // `accept` entirely. The decoded image is cached against this object URL, so
    // the crop's own decode later is free.
    try {
      await decodeImage(url);
    } catch (err) {
      URL.revokeObjectURL(url);
      showError(err, "That file could not be read as an image.");
      return;
    }

    setPickedUrl(url);
  };

  const closeDialog = () => setPickedUrl(null);

  const handleSave = async (area: Area) => {
    if (!pickedUrl) return;

    setIsSaving(true);
    try {
      // PNG rather than WebP, unlike a card image: `PUT /user/avatar` re-encodes
      // to WebP itself, so lossless here costs nothing but the upload and spends
      // no quality on a picture the server is about to compress anyway.
      const blob = await cropToBlob(pickedUrl, area, {
        maxWidth: AVATAR_EXPORT_SIZE,
        type: "image/png",
      });
      await authAPI.uploadAvatar(blob, "avatar.png");
      // Re-reading the user is what changes the header: `avatar_sha256` is the new
      // picture's version, and every `UserAvatar` fetches from a URL carrying it.
      await refreshUser();
      closeDialog();
      toast({
        title: "Saved",
        description: "Your profile picture has been updated.",
      });
    } catch (err) {
      showError(err, "Failed to save your picture");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await authAPI.removeAvatar();
      await refreshUser();
      toast({
        title: "Removed",
        description: "Your profile picture is back to your initials.",
      });
    } catch (err) {
      showError(err, "Failed to remove your picture");
    } finally {
      setIsRemoving(false);
    }
  };

  if (!user) return null;

  const hasAvatar = !!user.avatar_sha256;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Profile Picture
        </CardTitle>
        <CardDescription>
          Shown in the account menu, and only to you until OpenDiving grows a
          way to share a log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <UserAvatar
            name={user.name}
            avatarSha={user.avatar_sha256}
            size={80}
            className="h-20 w-20"
          />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={isRemoving}
              >
                <Camera className="h-4 w-4 mr-2" />
                {hasAvatar ? "Change photo" : "Add a photo"}
              </Button>

              {hasAvatar && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRemove}
                  disabled={isRemoving}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </Button>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Stored on this instance, never sent anywhere else. It is
              re-encoded when you save it, which strips the location and camera
              details a phone photo carries.
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={(event) => void handlePick(event)}
          aria-label="Choose a profile picture"
        />
      </CardContent>

      {pickedUrl && (
        <ImageCropDialog
          imageSrc={pickedUrl}
          aspect={1}
          cropShape="round"
          title="Adjust your photo"
          description="Drag to move, pinch or use the slider to zoom. Only the circle is saved."
          saveLabel="Save photo"
          savingLabel="Saving..."
          isSaving={isSaving}
          onCancel={closeDialog}
          onSave={handleSave}
        />
      )}
    </Card>
  );
}
