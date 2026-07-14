ALTER TABLE public.players ADD COLUMN IF NOT EXISTS owned_cosmetics text[] not null default '{}';

-- Redefine buy_cosmetic to use inventory
DROP FUNCTION IF EXISTS public.buy_cosmetic(text, text, text, integer);
CREATE OR REPLACE FUNCTION public.buy_cosmetic(p_type text, p_id text, p_color text)
RETURNS public.players
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  row public.players;
  v_cost int;
  v_item_key text;
  v_owned boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  PERFORM public.check_rate_limit();
  
  -- Determine item key and cost
  IF p_type = 'hat' THEN
    v_item_key := p_id;
    IF p_id = 'none' THEN
      v_cost := 0;
    ELSIF p_id = 'wizard' THEN v_cost := 150;
    ELSIF p_id = 'tophat' THEN v_cost := 200;
    ELSIF p_id = 'crown' THEN v_cost := 500;
    ELSE v_cost := 99999;
    END IF;
  ELSE
    v_item_key := p_color;
    IF p_color = '#d46a2a' THEN v_cost := 50;
    ELSIF p_color = '#c44030' THEN v_cost := 50;
    ELSIF p_color = '#e8b830' THEN v_cost := 50;
    ELSIF p_color = '#5098d0' THEN v_cost := 100;
    ELSIF p_color = '#b080d0' THEN v_cost := 100;
    ELSIF p_color = '#e878a0' THEN v_cost := 100;
    ELSIF p_color = '#308a78' THEN v_cost := 150;
    ELSIF p_color = '#c8d8d0' THEN v_cost := 150;
    ELSIF p_color = '#222222' THEN v_cost := 200;
    ELSIF p_color = '#2e8b57' THEN v_cost := 150;
    ELSE v_cost := 99999;
    END IF;
  END IF;

  SELECT * INTO row FROM public.players WHERE id = auth.uid();
  
  -- Check if already owned
  v_owned := v_item_key = ANY(row.owned_cosmetics) OR v_item_key = 'none';

  -- If not owned, check gold and deduct
  IF NOT v_owned THEN
    IF row.gold < v_cost THEN RAISE EXCEPTION 'not enough gold'; END IF;
    row.gold := row.gold - v_cost;
    row.owned_cosmetics := array_append(row.owned_cosmetics, v_item_key);
  END IF;

  -- Equip item
  IF p_type = 'hat' THEN
    IF p_id = 'none' THEN row.hat_id := NULL; ELSE row.hat_id := p_id; END IF;
  ELSIF p_type = 'head' THEN
    row.head_color := p_color;
  ELSIF p_type = 'body' THEN
    row.body_color := p_color;
  ELSIF p_type = 'legs' THEN
    row.leg_color := p_color;
  END IF;

  -- Commit changes
  UPDATE public.players 
  SET hat_id = row.hat_id, 
      head_color = row.head_color, 
      body_color = row.body_color, 
      leg_color = row.leg_color, 
      gold = row.gold, 
      owned_cosmetics = row.owned_cosmetics
  WHERE id = auth.uid() 
  RETURNING * INTO row;
  
  RETURN row;
END
$$;
GRANT EXECUTE ON FUNCTION public.buy_cosmetic(text, text, text) TO authenticated;
