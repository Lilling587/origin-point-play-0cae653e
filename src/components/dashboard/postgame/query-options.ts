import { queryOptions } from "@tanstack/react-query";
import {
  getAllTimeHeadToHead,
  getLastMeetingRecap,
  getSeasonTrajectory,
} from "@/lib/stats.functions";

export const allTimeH2HOptions = (home: string, away: string) =>
  queryOptions({
    queryKey: ["allTimeH2H", home, away],
    queryFn: () => getAllTimeHeadToHead({ data: { home, away } }),
    staleTime: 6 * 60 * 60 * 1000,
  });

export const lastMeetingOptions = (home: string, away: string) =>
  queryOptions({
    queryKey: ["lastMeeting", home, away],
    queryFn: () => getLastMeetingRecap({ data: { home, away } }),
    staleTime: 6 * 60 * 60 * 1000,
  });

export const trajectoryOptions = (team: string, season: string | undefined) =>
  queryOptions({
    queryKey: ["trajectory", season ?? "default", team],
    queryFn: () => getSeasonTrajectory({ data: { team, season } }),
    staleTime: 6 * 60 * 60 * 1000,
  });
