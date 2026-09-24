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
import { cn } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface ImageCropDialogProps {
  // Object URL of the image being cropped. The dialog is mounted only while there is
  // one, so it is never null here.
  imageSrc: string;
  /** Width over height of the crop. */
  aspect: number;
  /**
   * Where the crop opens, in natural pixels of the source - a stored picture's own
   * crop, so adjusting it starts from what the diver chose last time rather than from
   * the centre. Read once, when the image loads.
   */
  initialArea?: Area;
  /** `round` for an avatar, `rect` for anything drawn as itself. */
  cropShape?: "rect" | "round";
  title: string;
  description: string;
  saveLabel: string;
  savingLabel: string;
  isSaving: boolean;
  onCancel: () => void;
  // Handed the chosen rectangle in *natural* pixels of the source image. Turning
  // that into bytes and storing them belongs to the caller, which is what owns the
  // outcome - so this must not reject.
  onSave: (area: Area) => void;
}

/**
 * Pick the part of a picture that is kept: drag to move, zoom, save.
 *
 * Shared by the two pictures and the certification card. Each crops to the shape it
 * is drawn in - a round mask at `aspect={1}` for the avatar, 7:9 for the portrait,
 * the standard card shape for a card - and each caller decides what the rectangle
 * becomes: a card's is drawn onto a canvas and exported, a picture's is sent to the
 * API as numbers beside the file itself.
 *
 * Zoom is a native `<input type="range">` rather than a Radix slider: it is one
 * value with no empty state, and the native control is keyboard- and
 * touch-accessible without adding a dependency for it.
 */
export function ImageCropDialog({
  imageSrc,
  aspect,
  initialArea,
  cropShape = "rect",
  title,
  description,
  saveLabel,
  savingLabel,
  isSaving,
  onCancel,
  onSave,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);

  // Fires on every gesture, so it has to be stable or the cropper re-subscribes
  // continuously. The *pixels* argument is the one worth keeping: it is in natural
  // source pixels, which is what the canvas export draws from and what the API's
  // crop is measured in.
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* The cropper is absolutely positioned inside its container, so it needs
            one with a height of its own. */}
        <div
          className={cn(
            "relative h-64 w-full overflow-hidden bg-muted",
            // Matches the mask: a round crop in a square-cornered box reads as a
            // preview of something else.
            cropShape === "round" ? "rounded-md" : "rounded-lg",
          )}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            initialCroppedAreaPixels={initialArea}
            cropShape={cropShape}
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
          <Label htmlFor="image-crop-zoom" className="flex items-center gap-2">
            <ZoomIn className="h-4 w-4" />
            Zoom
          </Label>
          <input
            id="image-crop-zoom"
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
            // rectangle, which is one frame *because the caller has already decoded
            // this source* - `Cropper` has no failure callback, so undecodable
            // bytes would leave this null forever with nothing said. Keeping that
            // check out of here is deliberate: the caller refuses the file before
            // this dialog is ever mounted.
            onClick={() => area && onSave(area)}
            disabled={isSaving || !area}
          >
            {isSaving ? (
              <div className="flex items-center space-x-2">
                <ButtonSpinner />
                <span>{savingLabel}</span>
              </div>
            ) : (
              <span>{saveLabel}</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
