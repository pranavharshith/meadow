-- Create the trigger function that enforces the sanitization
CREATE OR REPLACE FUNCTION public.enforce_clean_player_name()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the name is being introduced or changed, and if it fails the filter
    IF (TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name) THEN
        IF public.name_contains_profanity(NEW.name) THEN
            NEW.name := 'wanderer';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to your players table
DROP TRIGGER IF EXISTS trigger_clean_player_name ON public.players;
CREATE TRIGGER trigger_clean_player_name
    BEFORE INSERT OR UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_clean_player_name();
