%% -------------------------------------------------------------------
%%
%% Copyright (c) 2017 Carlos Gonzalez Florido.  All Rights Reserved.
%%
%% This file is provided to you under the Apache License,
%% Version 2.0 (the "License"); you may not use this file
%% except in compliance with the License.  You may obtain
%% a copy of the License at
%%
%%   http://www.apache.org/licenses/LICENSE-2.0
%%
%% Unless required by applicable law or agreed to in writing,
%% software distributed under the License is distributed on an
%% "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
%% KIND, either express or implied.  See the License for the
%% specific language governing permissions and limitations
%% under the License.
%%
%% -------------------------------------------------------------------

%% @doc Session Object API
-module(nkadmin_session_obj_api).
-author('Carlos Gonzalez <carlosj.gf@gmail.com>').

-export([cmd/3]).

-include("nkadmin.hrl").
-include_lib("nkdomain/include/nkdomain.hrl").
-include_lib("nkevent/include/nkevent.hrl").
-include_lib("nkservice/include/nkservice.hrl").


-define(ADMIN_DEF_EVENT_TYPES, [
    <<"update_elements">>,
    <<"unloaded">>
]).


%% ===================================================================
%% API
%% ===================================================================


%% @doc
cmd(<<"find">>, #nkreq{data=Data, srv_id=SrvId}=Req, State) ->
    case get_user_id(Data, Req, State) of
        {ok, UserId} ->
            case nkadmin_session_obj:find(SrvId, UserId) of
                {ok, List} ->
                    {ok, #{sessions=>List}, State};
                {error, Error} ->
                    {error, Error, State}
            end;
        Error ->
            Error
    end;

cmd(<<"create">>, #nkreq{data=Data, srv_id=SrvId}=Req, State) ->
    case get_user_id(Data, Req, State) of
        {ok, UserId} ->
            case nkadmin_session_obj:create(SrvId, UserId) of
                {ok, #{obj_id:=ObjId}, _Pid} ->
                    Language = nklib_util:to_binary(maps:get(language, Data, <<"en">>)),
                    cmd(<<"start">>, Req#nkreq{data=Data#{id=>ObjId, language=>Language}}, State);
                {error, Error} ->
                    {error, Error, State}
            end;
        Error ->
            Error
    end;

cmd(<<"start">>, #nkreq{data=#{id:=Id}=Data, user_id=UserId, srv_id=SrvId}=Req, State) ->
    {ok, DomainId} = nkdomain_api_util:get_id(?DOMAIN_DOMAIN, domain_id, Data, State),
    Language = nklib_util:to_binary(maps:get(language, Data, <<"en">>)),
    case nkadmin_session_obj:start(SrvId, Id, DomainId, UserId, Language, self()) of
        {ok, ObjId, Reply} ->
            State2 = nkdomain_api_util:add_id(?DOMAIN_ADMIN_SESSION, ObjId, State),
            Types = maps:get(events, Data, ?ADMIN_DEF_EVENT_TYPES),
            Subs = #{
                srv_id => SrvId,
                class => ?DOMAIN_EVENT_CLASS,
                subclass => ?DOMAIN_ADMIN_SESSION,
                type => Types,
                obj_id => ObjId
            },
            ok = nkapi_server:subscribe(self(), Subs),
            State3 = State2#{nkadmin_session_types=>Types},
            {ok, Reply#{obj_id=>ObjId}, State3};
        {error, Error} ->
            {error, Error, State}
    end;

cmd(<<"start">>, #nkreq{data=Data}=Req, State) ->
    case cmd(<<"find">>, Req, State) of
        {ok, #{sessions:=[#{<<"obj_id">>:=SessId}|_]}, State2} ->
            cmd(<<"start">>, Req#nkreq{data=Data#{id=>SessId}}, State2);
        {ok, #{sessions:=[]}, State2} ->
            {error, session_not_found, State2};
        {error, Error, State2} ->
            {error, Error, State2}
    end;

cmd(<<"stop">>, #nkreq{data=Data, srv_id=SrvId}, State) ->
    case nkdomain_api_util:get_id(?DOMAIN_ADMIN_SESSION, Data, State) of
        {ok, Id} ->
            State2 = case State of
                #{nkadmin_session_types:=Types} ->
                    Subs = #{
                        srv_id => SrvId,
                        class => ?DOMAIN_EVENT_CLASS,
                        subclass => ?DOMAIN_ADMIN_SESSION,
                        type => Types,
                        obj_id => Id
                    },
                    nkapi_server:unsubscribe(self(), Subs),
                    maps:remove(nkadmin_session_types, State);
                _ ->
                    State
            end,
            case nkadmin_session_obj:stop(SrvId, Id) of
                ok ->
                    {ok, #{}, State2};
                {error, Error} ->
                    {error, Error, State2}
            end;
        Error ->
            Error
    end;

cmd(<<"switch_domain">>, #nkreq{data=#{domain_id:=DomId}=Data, srv_id=SrvId}, State) ->
    case nkdomain_api_util:get_id(?DOMAIN_ADMIN_SESSION, Data, State) of
        {ok, Id} ->
            case nkadmin_session_obj:switch_domain(SrvId, Id, DomId) of
                {ok, Reply} ->
                    {ok, Reply, State};
                {error, Error} ->
                    {error, Error, State}
            end;
        Error ->
            Error
    end;

cmd(<<"element_action">>, #nkreq{data=Data, srv_id=SrvId}, State) ->
    #{element_id:=ElementId, action:=Action} = Data,
    Value = maps:get(value, Data, <<>>),
    case nkdomain_api_util:get_id(?DOMAIN_ADMIN_SESSION, Data, State) of
        {ok, Id} ->
            case nkadmin_session_obj:element_action(SrvId, Id, ElementId, Action, Value) of
                {ok, Reply} ->
                    {ok, Reply, State};
                {error, Error} ->
                    {error, Error, State}
            end;
        Error ->
            Error
    end;

cmd(Cmd, Req, State) ->
    nkdomain_obj_api:api(Cmd, ?DOMAIN_ADMIN_SESSION, Req, State).



%% ===================================================================
%% Internal
%% ===================================================================

%% @private
get_user_id(#{user_id:=UserId}, _Req, _State) ->
    {ok, UserId};
get_user_id(_, #nkreq{user_id=UserId}, _State) when UserId /= <<>> ->
    {ok, UserId};
get_user_id(_Data, Req, State) ->
    {error, missing_user_id, Req, State}.
