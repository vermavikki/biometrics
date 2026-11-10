"use server";

import { createClient } from "@/lib/supabase/server";

export async function enrollFaceAction(descriptor: number[], imageBase64: string) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return { success: false, message: "Unauthorized user." };
    }

    if (descriptor.length !== 128) {
        return { success: false, message: "Invalid facial embedding format." };
    }

    // 1. Convert Base64 image to Buffer and upload to private Supabase Storage
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const filePath = `${user.id}/reference-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
        .from("face-verifications")
        .upload(filePath, buffer, {
            contentType: "image/jpeg",
            upsert: true,
        });

    if (uploadError) {
        return { success: false, message: `Storage upload failed: ${uploadError.message}` };
    }

    // 2. Format the array as a pgvector string: "[0.012, -0.043, ...]"
    const vectorString = `[${descriptor.join(",")}]`;

    const { error: dbError } = await supabase
        .from("user_face_profiles")
        .upsert(
            {
                user_id: user.id,
                image_path: filePath,
                embedding: vectorString,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

    if (dbError) {
        return { success: false, message: `Database error: ${dbError.message}` };
    }

    return { success: true, message: "Face enrolled successfully!" };
}

export async function verifyFaceAction(descriptor: number[]) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return { verified: false, message: "Unauthorized user." };
    }

    if (descriptor.length !== 128) {
        return { verified: false, message: "Invalid facial embedding." };
    }

    const vectorString = `[${descriptor.join(",")}]`;

    // Execute the pgvector Euclidean distance check inside Postgres
    const { data, error } = await supabase.rpc("verify_user_face", {
        candidate_embedding: vectorString,
        match_threshold: 0.45, // Strict threshold for production
    });

    if (error || !data || data.length === 0) {
        return { verified: false, message: "Verification query failed or no face enrolled." };
    }

    const { is_match, distance } = data[0];

    return {
        verified: is_match,
        distance: Number(distance.toFixed(4)),
        message: is_match
            ? `Identity verified! (Distance: ${distance.toFixed(3)})`
            : `Verification failed. Face does not match. (Distance: ${distance.toFixed(3)})`,
    };
}