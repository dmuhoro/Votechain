// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VoteChain {
    struct Candidate {
        uint id;
        string name;
        string party;
        uint voteCount;
    }

    struct Election {
        uint id;
        string title;
        string description;
        uint startTime;
        uint endTime;
        bool isActive;
        address creator;
        uint candidateCount;
        mapping(uint => Candidate) candidates;
        mapping(bytes32 => bool) nullifiers; // prevent double voting
    }

    mapping(uint => Election) public elections;
    uint public electionCount;
    address public owner;
    address public relayer; // the backend wallet that submits votes

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Only relayer can call this function");
        _;
    }

    modifier electionExists(uint _electionId) {
        require(_electionId > 0 && _electionId <= electionCount, "Election does not exist");
        _;
    }

    modifier electionActive(uint _electionId) {
        require(elections[_electionId].isActive, "Election is not active");
        require(block.timestamp >= elections[_electionId].startTime, "Election has not started yet");
        require(block.timestamp <= elections[_electionId].endTime, "Election has ended");
        _;
    }

    event ElectionCreated(uint indexed electionId, string title, address creator);
    event VoteCast(uint indexed electionId, uint indexed candidateId, bytes32 nullifier);
    event ElectionClosed(uint indexed electionId);

    constructor(address _relayer) {
        owner = msg.sender;
        relayer = _relayer;
        electionCount = 0;
    }

    function createElection(
        string memory _title,
        string memory _description,
        string[] memory _candidateNames,
        string[] memory _candidateParties,
        uint _startTime,
        uint _endTime
    ) external onlyOwner returns (uint electionId) {
        require(_candidateNames.length == _candidateParties.length, "Candidate names and parties must have same length");
        require(_startTime < _endTime, "End time must be after start time");
        require(_startTime >= block.timestamp, "Start time cannot be in the past");

        electionCount++;
        electionId = electionCount;

        Election storage newElection = elections[electionId];
        newElection.id = electionId;
        newElection.title = _title;
        newElection.description = _description;
        newElection.startTime = _startTime;
        newElection.endTime = _endTime;
        newElection.isActive = true;
        newElection.creator = msg.sender;
        newElection.candidateCount = _candidateNames.length;

        for (uint i = 0; i < _candidateNames.length; i++) {
            newElection.candidates[i + 1] = Candidate(i + 1, _candidateNames[i], _candidateParties[i], 0);
        }

        emit ElectionCreated(electionId, _title, msg.sender);
    }

    function castVote(
        uint _electionId,
        uint _candidateId,
        bytes32 _nullifier
    ) external onlyRelayer electionExists(_electionId) electionActive(_electionId) {
        Election storage election = elections[_electionId];
        require(!election.nullifiers[_nullifier], "Already voted");
        require(_candidateId > 0 && _candidateId <= election.candidateCount, "Invalid candidate ID");

        election.nullifiers[_nullifier] = true;
        election.candidates[_candidateId].voteCount++;

        emit VoteCast(_electionId, _candidateId, _nullifier);
    }

    function getResults(uint _electionId) external view electionExists(_electionId) returns (
        string[] memory names,
        string[] memory parties,
        uint[] memory voteCounts
    ) {
        Election storage election = elections[_electionId];
        names = new string[](election.candidateCount);
        parties = new string[](election.candidateCount);
        voteCounts = new uint[](election.candidateCount);

        for (uint i = 0; i < election.candidateCount; i++) {
            names[i] = election.candidates[i + 1].name;
            parties[i] = election.candidates[i + 1].party;
            voteCounts[i] = election.candidates[i + 1].voteCount;
        }
    }

    function getElection(uint _electionId) external view electionExists(_electionId) returns (
        string memory title,
        string memory description,
        uint startTime,
        uint endTime,
        bool isActive,
        uint candidateCount
    ) {
        Election storage election = elections[_electionId];
        title = election.title;
        description = election.description;
        startTime = election.startTime;
        endTime = election.endTime;
        isActive = election.isActive;
        candidateCount = election.candidateCount;
    }

    function closeElection(uint _electionId) external onlyOwner electionExists(_electionId) {
        Election storage election = elections[_electionId];
        require(election.isActive, "Election is already closed");
        election.isActive = false;
        emit ElectionClosed(_electionId);
    }

    function updateRelayer(address _newRelayer) external onlyOwner {
        require(_newRelayer != address(0), "New relayer address cannot be zero");
        relayer = _newRelayer;
    }
}
