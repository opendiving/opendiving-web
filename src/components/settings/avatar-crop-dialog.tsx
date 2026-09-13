"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
// The package injects this into a `<style>` element of its own by default, which a
// nonce-based CSP blocks - see `disableAutomaticStylesInjection` below. Imported so
// the rules ride in the app's own stylesheet instead, which `style-src 'self'`
// already allows.
import "react-easy-crop/react-easy-crop.css";
import { ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface AvatarCropDialogProps {
  // Object URL of the picked file. The dialog is mounted only while there is one,
  // so it is never null here.
  imageSrc: string;
  isSaving: boolean;
  onCancel: () => void;
  // Handed the chosen square in *natural* pixels of the source image. Turning that
  // into bytes and uploading them belongs to the card, which is what owns the
  // outcome - so this must not reject.
  onSave: (area: Area) => void;
}

/**
 * Pick the square of a photo that becomes the avatar.
 *
 * Round crop shape with `aspect={1}` because that is what the result is drawn as
 * everywhere in the app - a square preview of a picture that will be shown as a
 * circle is a promise about the corners that nothing keeps.
 *
 * Zoom is a native `<input type="range">` rather than a Radix slider: it is one
 * value with no empty state, and the native control is keyboard- and
 * touch-accessible without adding a dependency for it.
 */
export function AvatarCropDialog({
  imageSrc,
  isSaving,
  onCancel,
  onSave,
}: AvatarCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);

  // Fires on every gesture, so it has to be stable or the cropper re-subscribes
  // continuously. The *pixels* argument is the one worth keeping: it is in natural
  // source pixels, which is what the canvas export draws from.
  const handleCropComplete = useCallback(
    (_percent: Area, pixels: Area) => setArea(pixels),
    [],
  );

  return (
    <Dialog open onOpenChange={(next) => !next && !isSaving && onCancel()}>
      {/* No entrance zoom on this one dialog. `react-easy-crop` sizes itself from
          `getBoundingClientRect()`, which reports the *transformed* box - so the
          shared dialog's `zoom-in-95` has it measure a container 95% of its real
          size, and nothing ever re-measures: the recompute hangs off a
          `ResizeObserver`, which watches the layout box and so never fires when
          only an ancestor transform changes. The mask is then drawn 5% small while
          the exported crop is computed as 100% of the media, which is the mask and
          the saved picture disagreeing. Fade and slide are kept - a translation
          does not change the reported width or height. */}
      <DialogContent className="data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
          <DialogDescription>
            Drag to move, pinch or use the slider to zoom. Only the circle is
            saved.
          </DialogDescription>
        </DialogHeader>

        {/* The cropper is absolutely positioned inside its container, so it needs
            one with a height of its own. */}
        <div className="relative h-64 w-full overflow-hidden rounded-md bg-muted">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            // Its own `<style>` element carries no nonce, and this app's CSP is
            // nonce-based (`src/proxy.ts`) - so left on, the cropper renders
            // unstyled in production while looking fine in dev. The stylesheet is
            // imported at the top of this file instead.
            disableAutomaticStylesInjection
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="avatar-zoom" className="flex items-center gap-2">
            <ZoomIn className="h-4 w-4" />
            Zoom
          </Label>
          <input
            id="avatar-zoom"
            type="range"
            className="w-full accent-primary"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={isSaving}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            // `area` is null until the cropper has measured itself and reported a
            // rectangle, which is one frame *because the card has already decoded
            // this source* - `Cropper` has no failure callback, so undecodable
            // bytes would leave this null forever with nothing said. Keeping that
            // check out of here is deliberate: the card refuses the file before
            // this dialog is ever mounted.
            onClick={() => area && onSave(area)}
            disabled={isSaving || !area}
          >
            {isSaving ? (
              <div className="flex items-center space-x-2">
                <ButtonSpinner />
                <span>Saving...</span>
              </div>
            ) : (
              <span>Save photo</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
