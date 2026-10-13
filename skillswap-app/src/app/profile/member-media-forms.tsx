import Image from "next/image";
import {
  removeMemberGalleryItem,
  removeProfileImage,
  uploadMemberGallery,
  uploadProfileImage,
} from "./actions";

export function ProfileImageTools({ userId, hasImage }: { userId: string; hasImage: boolean }) {
  return (
    <div className="profile-media-tools">
      <div className="profile-avatar-preview">
        {hasImage ? (
          <Image
            src={`/api/member-avatar/${userId}?v=${encodeURIComponent(userId)}`}
            width={88}
            height={88}
            unoptimized
            alt="Your current profile picture"
          />
        ) : null}
      </div>
      <div>
        <p className="form-hint">
          Add a profile picture. Other members can see it when your profile is visible.
        </p>
        <form action={uploadProfileImage} className="profile-media-upload-form">
          <input
            name="profileImage"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
          />
          <button className="secondary-button">Upload profile picture</button>
        </form>
        {hasImage && (
          <form action={removeProfileImage}>
            <button className="text-button danger-text">Remove profile picture</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function MemberGallery({
  items,
  owner = false,
}: {
  items: Array<{ id: string; contentType: string }>;
  owner?: boolean;
}) {
  return (
    <div className="member-media-gallery">
      {items.map((item) => (
        <figure key={item.id}>
          {item.contentType.startsWith("video/") ? (
            <video controls playsInline preload="metadata" src={`/api/member-media/${item.id}`} />
          ) : (
            <Image
              src={`/api/member-media/${item.id}`}
              alt="Photo shared by this member"
              width={640}
              height={480}
              unoptimized
            />
          )}
          {owner && (
            <form action={removeMemberGalleryItem}>
              <input type="hidden" name="mediaId" value={item.id} />
              <button className="text-button danger-text">Remove</button>
            </form>
          )}
        </figure>
      ))}
      {owner && (
        <form action={uploadMemberGallery} className="profile-gallery-upload">
          <label>
            Add photos or a short video to your profile (optional)
            <input
              name="gallery"
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
              multiple
              required
            />
          </label>
          <p className="form-hint">
            Choose up to 3 files at a time, 15 MB total. Each file can be up to 8 MB.
          </p>
          <button className="secondary-button">Add to my profile</button>
        </form>
      )}
    </div>
  );
}
