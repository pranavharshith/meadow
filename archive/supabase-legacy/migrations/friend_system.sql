ALTER TABLE public.friends REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;

-- 1. Fetch full social graph in a single round-trip
CREATE OR REPLACE FUNCTION public.get_social_data()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_friends JSONB;
    v_requests JSONB;
BEGIN
    -- Compile compiled friends list (handling both user1 and user2 positions)
    SELECT json_agg(f) INTO v_friends FROM (
        SELECT 
            p.id, p.name, p.color,
            TRUE as is_friend
        FROM public.friends fr
        JOIN public.players p ON (p.id = fr.user1_id OR p.id = fr.user2_id)
        WHERE (fr.user1_id = v_user_id OR fr.user2_id = v_user_id)
          AND p.id != v_user_id
    ) f;

    -- Compile incoming friend requests
    SELECT json_agg(r) INTO v_requests FROM (
        SELECT 
            freq.id as request_id,
            p.id as sender_id, p.name, p.color
        FROM public.friend_requests freq
        JOIN public.players p ON p.id = freq.sender_id
        WHERE freq.receiver_id = v_user_id
    ) r;

    RETURN jsonb_build_object(
        'friends', COALESCE(v_friends, '[]'::jsonb),
        'requests', COALESCE(v_requests, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Send friend request by typing a display name
CREATE OR REPLACE FUNCTION public.send_friend_request_by_name(p_target_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_sender_id UUID := auth.uid();
    v_target_id UUID;
BEGIN
    -- Look up clean, trimmed target name
    SELECT id INTO v_target_id 
    FROM public.players 
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_target_name))
    LIMIT 1;

    IF v_target_id IS NULL THEN
        RETURN 'PLAYER_NOT_FOUND';
    END IF;

    IF v_target_id = v_sender_id THEN
        RETURN 'CANNOT_ADD_SELF';
    END IF;

    -- Check if already friends
    IF EXISTS (
        SELECT 1 FROM public.friends 
        WHERE (user1_id = least(v_sender_id, v_target_id) AND user2_id = greatest(v_sender_id, v_target_id))
    ) THEN
        RETURN 'ALREADY_FRIENDS';
    END IF;

    -- Insert request (ignore duplicates via ON CONFLICT)
    INSERT INTO public.friend_requests (sender_id, receiver_id)
    VALUES (v_sender_id, v_target_id)
    ON CONFLICT DO NOTHING;

    RETURN 'SUCCESS';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
